-- Humidity column, sourced from the ESP32 Dev Kit V1 bench rig's DHT11
-- (esp32-devkit-tilt-prototype/), which reports both temperature and
-- humidity in a single read. The firmware previously logged humidity to
-- serial only, with nowhere to post it -- this adds that column so it
-- actually reaches the dashboard. Nullable: no other device type reports
-- humidity (MCP9808/DS18B20 are temperature-only), so this is always
-- null for the Hub and the other tilt-module firmwares.

alter table readings add column if not exists humidity_pct numeric;

comment on column readings.humidity_pct is
  'Relative humidity 0-100, from a DHT11 (or similar) sensor. Null for every device type except the ESP32 Dev Kit V1 bench rig -- most sensors on this project (MCP9808, DS18B20) are temperature-only.';

-- ---------------------------------------------------------------------------
-- ingest_reading -- add p_humidity_pct
-- ---------------------------------------------------------------------------

-- Adding a new parameter changes the function's type signature (even
-- with a default), so this needs a drop-and-recreate, not a straight
-- replace -- same pattern tilt_gravity_support.sql used when it added
-- p_tilt_deg. Body is otherwise unchanged from 20260917140000
-- (fermentation_analytics.sql): same battery-low alert check, same OG
-- auto-capture logic.
drop function if exists ingest_reading(text, text, numeric, numeric, numeric);

create or replace function ingest_reading(
  p_device_id text,
  p_device_secret text,
  p_temperature_c numeric,
  p_battery_v numeric default null,
  p_tilt_deg numeric default null,
  p_humidity_pct numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device devices%rowtype;
begin
  perform verify_device_secret(p_device_id, p_device_secret);

  insert into readings (device_id, temperature_c, battery_v, tilt_deg, humidity_pct)
  values (p_device_id, p_temperature_c, p_battery_v, p_tilt_deg, p_humidity_pct);

  update devices set last_seen_at = now() where id = p_device_id;

  select * into v_device from devices where id = p_device_id;

  if v_device.battery_min_v is not null
     and p_battery_v is not null
     and p_battery_v < v_device.battery_min_v
     and not alerts_muted(p_device_id)
     and not exists (
       select 1 from alerts
       where device_id = p_device_id and reason = 'battery_low' and not acknowledged
     )
  then
    insert into alerts (device_id, temperature_c, reason)
    values (p_device_id, p_temperature_c, 'battery_low');
  end if;

  if v_device.og_tilt_deg is null
     and p_tilt_deg is not null
     and v_device.calibration_c is not null
  then
    update devices
       set og_tilt_deg = p_tilt_deg,
           og_temp_c = p_temperature_c,
           fermentation_started_at = coalesce(fermentation_started_at, now())
     where id = p_device_id;
  end if;
end;
$$;

revoke execute on function ingest_reading(text, text, numeric, numeric, numeric, numeric) from public;
grant execute on function ingest_reading(text, text, numeric, numeric, numeric, numeric) to anon;

-- ---------------------------------------------------------------------------
-- readings_with_gravity -- expose humidity_pct (explicit column list, so it
-- doesn't appear automatically the way a `select *` view would pick it up)
-- ---------------------------------------------------------------------------

drop view if exists readings_with_gravity;

create view readings_with_gravity
with (security_invoker = true)
as
select
  r.id,
  r.device_id,
  r.temperature_c,
  r.battery_v,
  r.tilt_deg,
  r.humidity_pct,

  case
    when r.tilt_deg is null or d.calibration_c is null then null
    else coalesce(d.calibration_a, 0) * power(r.tilt_deg, 3)
       + coalesce(d.calibration_b, 0) * power(r.tilt_deg, 2)
       + d.calibration_c * r.tilt_deg
       + coalesce(d.calibration_d, 0)
  end as gravity_sg_raw,

  case
    when r.tilt_deg is null or d.calibration_c is null then null
    else (
      coalesce(d.calibration_a, 0) * power(r.tilt_deg, 3)
      + coalesce(d.calibration_b, 0) * power(r.tilt_deg, 2)
      + d.calibration_c * r.tilt_deg
      + coalesce(d.calibration_d, 0)
    )
    * case
        when r.temperature_c is null then 1
        else public.hydrometer_temp_factor(r.temperature_c)
           / public.hydrometer_temp_factor(d.calibration_temp_c)
      end
    + case
        when r.temperature_c is null then 0
        else d.temp_coeff_sg_per_c * (r.temperature_c - d.calibration_temp_c)
      end
  end as gravity_sg,

  r.created_at
from readings r
join devices d on d.id = r.device_id;

grant select on readings_with_gravity to authenticated;
