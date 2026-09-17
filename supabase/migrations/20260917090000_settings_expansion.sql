-- Settings expansion: battery alerts, snooze, unclaim/transfer, email opt-out
--
-- Four independent additions, bundled because they touch the same three
-- functions:
--   1. battery_min_v      -- optional low-battery threshold, checked in ingest_reading
--   2. alerts_muted_until -- snooze, checked in ingest_alert AND the battery check
--   3. unclaim_device()   -- the reverse of claim_device(): release ownership,
--                            mint a fresh claim code, without touching history
--   4. notify_email       -- per-device opt-out for the alert-notify edge function

-- ---------------------------------------------------------------------------
-- 1. Battery alerting
-- ---------------------------------------------------------------------------

-- Null by default, not a sensible-looking number like 3.3 -- a bench unit
-- running off USB with no cell attached reads noise on the battery divider
-- (0-1.2V observed), and a default threshold would alert on every single one
-- of those. This is opt-in per device once a real battery is fitted.
alter table devices add column if not exists battery_min_v numeric;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'devices_battery_min_v_check'
  ) then
    alter table devices add constraint devices_battery_min_v_check
      check (battery_min_v is null or (battery_min_v > 0 and battery_min_v < 5));
  end if;
end $$;

comment on column devices.battery_min_v is
  'Optional low-battery alert threshold in volts. NULL = disabled -- leave unset on bench/USB power, where the reading is noise rather than a real cell voltage.';

-- One open alert at a time, not a consecutive-breach counter like temperature.
-- A single low reading is real signal (unlike one warm reading, which could be
-- a fermentation actually running hot); RTC-memory breach counting also
-- doesn't survive a reset, which is exactly the fragility that lost the
-- above_max test earlier. Dedup is "is there already an unacknowledged one",
-- which needs no device-side state at all.
create index if not exists alerts_device_reason_unacked_idx
  on alerts (device_id, reason) where not acknowledged;

-- ---------------------------------------------------------------------------
-- 2. Snooze
-- ---------------------------------------------------------------------------

alter table devices add column if not exists alerts_muted_until timestamptz;

comment on column devices.alerts_muted_until is
  'While in the future, ingest_alert() and the battery check in ingest_reading() both drop alerts silently rather than inserting them. Readings keep posting normally -- only alerting pauses.';

-- Only ever called internally by ingest_alert and ingest_reading, which run
-- as the function owner -- so, same reasoning as verify_device_secret
-- (20260910123000), no grant to anon/authenticated is needed or wanted. A
-- direct PostgREST grant here would hand anon a free "does this device_id
-- exist and is it currently muted" oracle with no other purpose.
create or replace function alerts_muted(p_device_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select alerts_muted_until > now() from devices where id = p_device_id),
    false
  );
$$;

revoke execute on function alerts_muted(text) from public;

-- ---------------------------------------------------------------------------
-- ingest_alert -- now drops the insert while muted
-- ---------------------------------------------------------------------------

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

  if alerts_muted(p_device_id) then
    return;
  end if;

  insert into alerts (device_id, temperature_c, reason)
  values (p_device_id, p_temperature_c, p_reason);
end;
$$;

-- ---------------------------------------------------------------------------
-- ingest_reading -- now also raises battery_low when applicable
-- ---------------------------------------------------------------------------

create or replace function ingest_reading(
  p_device_id text,
  p_device_secret text,
  p_temperature_c numeric,
  p_battery_v numeric default null,
  p_tilt_deg numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_battery_min numeric;
begin
  perform verify_device_secret(p_device_id, p_device_secret);

  insert into readings (device_id, temperature_c, battery_v, tilt_deg)
  values (p_device_id, p_temperature_c, p_battery_v, p_tilt_deg);

  update devices set last_seen_at = now() where id = p_device_id;

  select battery_min_v into v_battery_min from devices where id = p_device_id;

  if v_battery_min is not null
     and p_battery_v is not null
     and p_battery_v < v_battery_min
     and not alerts_muted(p_device_id)
     and not exists (
       select 1 from alerts
       where device_id = p_device_id and reason = 'battery_low' and not acknowledged
     )
  then
    insert into alerts (device_id, temperature_c, reason)
    values (p_device_id, p_temperature_c, 'battery_low');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_device_config -- expose the battery threshold to the firmware
-- ---------------------------------------------------------------------------

create or replace function get_device_config(p_device_id text, p_device_secret text)
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
    'sleep_interval_seconds', sleep_interval_seconds,
    'battery_min_v', battery_min_v
  )
  into result
  from devices
  where id = p_device_id;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Unclaim / transfer -- the reverse of claim_device()
-- ---------------------------------------------------------------------------

-- Releasing a device clears user_id, which RLS makes invisible to everyone
-- (see 20260915090000). That means this function is the ONLY place the new
-- claim code can be read -- a follow-up select from the now-unowned row
-- would return nothing even to the person who just ran this. The caller must
-- capture the return value; there is no second chance to fetch it.
create or replace function unclaim_device(p_device_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_updated text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  loop
    v_code := gen_claim_code();
    exit when not exists (select 1 from devices d where d.claim_code = v_code);
  end loop;

  update devices
     set user_id = null,
         claimed_at = null,
         claim_code = v_code
   where id = p_device_id
     and user_id = v_uid          -- only the current owner can release it
  returning id into v_updated;

  if v_updated is null then
    raise exception 'Device not found, or you are not its owner' using errcode = 'P0002';
  end if;

  return v_code;
end;
$$;

revoke execute on function unclaim_device(text) from public;
revoke execute on function unclaim_device(text) from anon;
grant execute on function unclaim_device(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Email opt-out for alert-notify
-- ---------------------------------------------------------------------------

alter table devices add column if not exists notify_email boolean not null default true;

comment on column devices.notify_email is
  'Read by the alert-notify edge function. false suppresses email for this device without touching alerts_muted_until, which also silences the dashboard alert itself.';
