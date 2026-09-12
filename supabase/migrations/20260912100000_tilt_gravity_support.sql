-- Temp + Gravity Module support
--
-- Adds tilt readings and per-device gravity calibration, so the floating
-- module (see hardware/MULTI_SENSOR_MODULES.md) can post alongside Hub
-- devices without a separate table. Temperature/battery/alerting all stay
-- exactly as they are -- the floating module reports temperature as a
-- first-class reading, so the existing threshold alerting applies to it
-- unchanged.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

-- Raw tilt angle in degrees from vertical. Null for Hub devices.
alter table readings add column if not exists tilt_deg numeric;

-- Which kind of device this row is, so the dashboard can pick a view.
alter table devices add column if not exists device_type text not null default 'hub';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'devices_device_type_check'
  ) then
    alter table devices add constraint devices_device_type_check
      check (device_type in ('hub', 'tilt', 'co2'));
  end if;
end;
$$;

-- Per-device gravity calibration: SG = a*tilt^3 + b*tilt^2 + c*tilt + d.
-- Cubic is what the iSpindel calibration workflow produces; zero out the
-- higher terms for a quadratic or linear fit. All null => no calibration
-- done yet => gravity reads null rather than a garbage number.
alter table devices add column if not exists calibration_a numeric;
alter table devices add column if not exists calibration_b numeric;
alter table devices add column if not exists calibration_c numeric;
alter table devices add column if not exists calibration_d numeric;

comment on column devices.calibration_c is 'SG = a*tilt^3 + b*tilt^2 + c*tilt + d, fitted per-device from reference-gravity samples taken during setup.';

-- ---------------------------------------------------------------------------
-- ingest_reading: add the optional tilt parameter
-- ---------------------------------------------------------------------------

-- NOTE: adding a parameter creates a *new* signature rather than replacing
-- the old one, and leaving both in place makes PostgREST fail with "could
-- not choose the best candidate function" when a call matches both. So the
-- 4-arg version is dropped first, then recreated with the extra defaulted
-- parameter -- Hub firmware that sends only the original four keys keeps
-- working against it.
drop function if exists ingest_reading(text, text, numeric, numeric);

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
begin
  perform verify_device_secret(p_device_id, p_device_secret);

  insert into readings (device_id, temperature_c, battery_v, tilt_deg)
  values (p_device_id, p_temperature_c, p_battery_v, p_tilt_deg);

  update devices set last_seen_at = now() where id = p_device_id;
end;
$$;

revoke execute on function ingest_reading(text, text, numeric, numeric, numeric) from public;
grant execute on function ingest_reading(text, text, numeric, numeric, numeric) to anon;

-- ---------------------------------------------------------------------------
-- Gravity is computed on read, not stored
-- ---------------------------------------------------------------------------

-- Keeping raw tilt in the table and applying the calibration curve here
-- means recalibrating a device fixes its whole history, instead of baking
-- a wrong curve into every stored row.
--
-- security_invoker is load-bearing: without it this view would run as its
-- owner and hand every caller all rows, bypassing the RLS policies on
-- `readings` entirely.
create or replace view readings_with_gravity
with (security_invoker = true)
as
select
  r.id,
  r.device_id,
  r.temperature_c,
  r.battery_v,
  r.tilt_deg,
  case
    when r.tilt_deg is null or d.calibration_c is null then null
    else coalesce(d.calibration_a, 0) * power(r.tilt_deg, 3)
       + coalesce(d.calibration_b, 0) * power(r.tilt_deg, 2)
       + d.calibration_c * r.tilt_deg
       + coalesce(d.calibration_d, 0)
  end as gravity_sg,
  r.created_at
from readings r
join devices d on d.id = r.device_id;

grant select on readings_with_gravity to authenticated;
