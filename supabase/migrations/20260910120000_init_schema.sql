-- Fermentation Monitor: initial schema
--
-- Design notes:
--   * Devices belong to a dashboard user (auth.users) and carry their own
--     alert thresholds + sleep interval, editable from the dashboard and
--     fetched by the firmware each wake cycle (see get_device_config()).
--   * Firmware never talks to the readings/alerts/devices tables directly
--     with the anon key. It calls SECURITY DEFINER RPC functions that
--     verify a per-device secret first. This means a leaked anon key
--     (which ships inside every physical unit) cannot be used to read or
--     write another customer's data -- only the matching device_secret can.
--   * Dashboard users (authenticated role) read through normal RLS scoped
--     to devices.user_id = auth.uid().

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists devices (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_secret text not null,
  name text not null default 'Fermentation Monitor',
  temp_min_c numeric not null default 18.0,
  temp_max_c numeric not null default 24.0,
  consecutive_breach_limit integer not null default 3,
  sleep_interval_seconds integer not null default 600,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table devices is 'One row per physical sensor unit. device_secret is checked inside the ingest_*/get_device_config RPCs, never exposed to other users.';

create table if not exists readings (
  id bigint generated always as identity primary key,
  device_id text not null references devices(id) on delete cascade,
  temperature_c numeric not null,
  battery_v numeric,
  created_at timestamptz not null default now()
);

create index if not exists readings_device_id_created_at_idx
  on readings (device_id, created_at desc);

create table if not exists alerts (
  id bigint generated always as identity primary key,
  device_id text not null references devices(id) on delete cascade,
  temperature_c numeric not null,
  reason text not null,
  created_at timestamptz not null default now(),
  acknowledged boolean not null default false
);

create index if not exists alerts_device_id_created_at_idx
  on alerts (device_id, created_at desc);

-- Phase 0 landing page email/pre-order signups.
create table if not exists waitlist (
  id bigint generated always as identity primary key,
  email text not null unique,
  comment text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table devices enable row level security;
alter table readings enable row level security;
alter table alerts enable row level security;
alter table waitlist enable row level security;

-- Dashboard users manage only their own devices.
create policy "users select own devices" on devices
  for select to authenticated
  using (user_id = auth.uid());

create policy "users insert own devices" on devices
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "users update own devices" on devices
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "users delete own devices" on devices
  for delete to authenticated
  using (user_id = auth.uid());

-- Dashboard users read readings/alerts for devices they own. Writes to
-- these two tables happen exclusively through the SECURITY DEFINER RPCs
-- below, so there are intentionally no insert/update/delete policies here
-- for the anon or authenticated roles.
create policy "users select own readings" on readings
  for select to authenticated
  using (exists (
    select 1 from devices
    where devices.id = readings.device_id
      and devices.user_id = auth.uid()
  ));

create policy "users select own alerts" on alerts
  for select to authenticated
  using (exists (
    select 1 from devices
    where devices.id = alerts.device_id
      and devices.user_id = auth.uid()
  ));

-- Users can acknowledge alerts on their own devices.
create policy "users acknowledge own alerts" on alerts
  for update to authenticated
  using (exists (
    select 1 from devices
    where devices.id = alerts.device_id
      and devices.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from devices
    where devices.id = alerts.device_id
      and devices.user_id = auth.uid()
  ));

-- Landing page: anyone can join the waitlist, nobody can read it back
-- through the API (staff read it via the Supabase dashboard/SQL editor).
create policy "anyone can join waitlist" on waitlist
  for insert to anon, authenticated
  with check (true);

-- ---------------------------------------------------------------------------
-- Device-authenticated RPCs (called by firmware with the anon key)
-- ---------------------------------------------------------------------------

-- Shared helper: raises unless device_id + device_secret match a real row.
create or replace function verify_device_secret(p_device_id text, p_device_secret text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from devices
    where id = p_device_id
      and device_secret = p_device_secret
  ) then
    raise exception 'invalid device credentials' using errcode = '28000';
  end if;
end;
$$;

create or replace function ingest_reading(
  p_device_id text,
  p_device_secret text,
  p_temperature_c numeric,
  p_battery_v numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform verify_device_secret(p_device_id, p_device_secret);

  insert into readings (device_id, temperature_c, battery_v)
  values (p_device_id, p_temperature_c, p_battery_v);

  update devices set last_seen_at = now() where id = p_device_id;
end;
$$;

create or replace function ingest_alert(
  p_device_id text,
  p_device_secret text,
  p_temperature_c numeric,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform verify_device_secret(p_device_id, p_device_secret);

  insert into alerts (device_id, temperature_c, reason)
  values (p_device_id, p_temperature_c, p_reason);
end;
$$;

create or replace function get_device_config(
  p_device_id text,
  p_device_secret text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  result json;
begin
  perform verify_device_secret(p_device_id, p_device_secret);

  select json_build_object(
    'temp_min_c', temp_min_c,
    'temp_max_c', temp_max_c,
    'consecutive_breach_limit', consecutive_breach_limit,
    'sleep_interval_seconds', sleep_interval_seconds
  )
  into result
  from devices
  where id = p_device_id;

  return result;
end;
$$;

-- Lock down direct table access for anon; the RPCs above are the only way
-- an unauthenticated device can read or write. authenticated (dashboard
-- users) keep table access, governed by the RLS policies above.
revoke all on devices from anon;
revoke all on readings from anon;
revoke all on alerts from anon;

grant execute on function verify_device_secret(text, text) to anon;
grant execute on function ingest_reading(text, text, numeric, numeric) to anon;
grant execute on function ingest_alert(text, text, numeric, text) to anon;
grant execute on function get_device_config(text, text) to anon;
