-- Firmware admin console: an internal fleet-firmware publisher
--
-- Every existing table and RLS policy in this project is scoped to "the
-- user who owns this device" -- there is no admin/staff concept anywhere.
-- This adds the smallest one that works: a settable admin_users table
-- (not a hardcoded UID) so a second admin can be added later with an
-- insert, not a migration.
--
-- Deliberately does NOT touch the OTA mechanism devices already run.
-- checkForOTAUpdate() in both sketches fetches a flat {"version":N,"url":"..."}
-- manifest.json from a fixed, unauthenticated public URL and hand-parses it
-- by substring search (see firmware/README.md -- "not a real JSON library").
-- Reusing that exact contract instead of replacing it with a PostgREST RPC
-- means zero changes to OTA code that has never run against real hardware
-- yet (see docs/IMPLEMENTATION_PLAN.md). This migration only adds the
-- bucket + policies the admin console needs to publish new manifest.json /
-- vN.bin objects into the same public Storage bucket the firmware already
-- expects -- one bucket, two subpaths (hub/, tilt/) instead of one shared
-- manifest, so each sketch's OTA_MANIFEST_URL points at its own file.

-- ---------------------------------------------------------------------------
-- Admin role
-- ---------------------------------------------------------------------------

create table if not exists admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- RLS on with no policies: same pattern as claim_attempts (20260915103000)
-- -- nothing reads or writes this table except is_admin() and whoever seeds
-- it directly, both of which run as the function/table owner.
alter table admin_users enable row level security;

comment on table admin_users is
  'Grants access to the firmware admin console and any future admin-only surface. Seed with: insert into admin_users (user_id) select id from auth.users where email = ''...'';';

create or replace function is_admin(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from admin_users where user_id = p_uid);
$$;

revoke execute on function is_admin(uuid) from public;
grant execute on function is_admin(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- firmware_releases -- bookkeeping only, not the OTA source of truth
-- ---------------------------------------------------------------------------

-- The firmware never reads this table -- it reads manifest.json from
-- Storage, same as always. This exists so the console has upload history,
-- release notes, and a "what's currently live" indicator without having to
-- parse Storage object listings to reconstruct it.
create table if not exists firmware_releases (
  id bigserial primary key,
  device_type text not null check (device_type in ('hub', 'tilt', 'co2')),
  version int not null,
  storage_path text not null,
  notes text,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

-- At most one published release per device type -- enforced here, not just
-- in application code, so a bug in the console can't leave two "current"
-- rows disagreeing about which version is actually live.
create unique index if not exists firmware_releases_one_published_per_type
  on firmware_releases (device_type)
  where published;

alter table firmware_releases enable row level security;

create policy "admins manage firmware_releases" on firmware_releases
  for all to authenticated
  using (is_admin())
  with check (is_admin());

comment on table firmware_releases is
  'Upload/publish history for the firmware admin console. Devices never read this table -- they read manifest.json from the firmware Storage bucket, written by publish_firmware_release() below plus a client-side Storage write.';

-- ---------------------------------------------------------------------------
-- publish_firmware_release -- atomically swaps which release is "current"
-- ---------------------------------------------------------------------------

-- The console writes the actual manifest.json Storage object itself (SQL
-- can't call the Storage API), then calls this to record it: unpublish
-- whatever was published for this device_type, publish this one. Wrapped
-- in one function so those two updates can't be left half-done by a
-- mid-flight client error between them.
create or replace function publish_firmware_release(p_release_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device_type text;
begin
  if not is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select device_type into v_device_type from firmware_releases where id = p_release_id;
  if v_device_type is null then
    raise exception 'Release not found' using errcode = 'P0002';
  end if;

  update firmware_releases set published = false where device_type = v_device_type and published;
  update firmware_releases set published = true where id = p_release_id;
end;
$$;

revoke execute on function publish_firmware_release(bigint) from public;
grant execute on function publish_firmware_release(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: the firmware bucket devices already expect, admin-writable
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('firmware', 'firmware', true)
on conflict (id) do nothing;

create policy "public read firmware bucket" on storage.objects
  for select to public
  using (bucket_id = 'firmware');

create policy "admins write firmware bucket" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'firmware' and is_admin());

create policy "admins update firmware bucket" on storage.objects
  for update to authenticated
  using (bucket_id = 'firmware' and is_admin())
  with check (bucket_id = 'firmware' and is_admin());

create policy "admins delete firmware bucket" on storage.objects
  for delete to authenticated
  using (bucket_id = 'firmware' and is_admin());
