-- Temperature correction for tilt-derived specific gravity
--
-- Until now the gravity view applied a tilt-only polynomial. That was a real
-- gap: the whole reason the floating module carries its own DS18B20 is that
-- the tilt -> SG relationship shifts with temperature, but nothing was using
-- the temperature it reported.
--
-- Why it matters: across a 5-35 C range the correction moves a reading by
-- about -1.9 to +4.3 gravity points relative to a 20 C calibration. That is
-- the difference between calling a batch finished at 1.010 and still working
-- at 1.014.

-- ---------------------------------------------------------------------------
-- The correction has to know what temperature the device was CALIBRATED at
-- ---------------------------------------------------------------------------

-- The tilt -> SG polynomial is fitted by floating the unit in reference
-- solutions at some temperature. Its output is therefore "SG as this device
-- reads at that temperature". Correcting to a 20 C reference means correcting
-- the difference between the measurement temperature and the CALIBRATION
-- temperature -- not between the measurement and an assumed 20 C. Guessing
-- this wrong silently biases every reading, so it is stored per device.
alter table devices add column if not exists calibration_temp_c numeric not null default 20;

comment on column devices.calibration_temp_c is
  'Temperature (C) of the reference solutions when this device''s tilt->SG polynomial was fitted. The temperature correction is applied relative to this, not to an assumed 20C. Default 20 is a convention, not a measurement -- set it to what you actually calibrated at.';

-- Optional per-device residual term. The standard correction below models the
-- LIQUID's thermal expansion, which is the dominant effect and needs no extra
-- calibration. It does not model the device's own: a plastic housing has a far
-- higher coefficient of expansion than a glass hydrometer, so its displaced
-- volume -- and therefore its buoyancy -- changes measurably over a 20 K swing.
-- That is device- and housing-specific and can only be measured, not derived,
-- so it defaults to 0 (a no-op) and stays that way unless someone calibrates at
-- more than one temperature.
alter table devices add column if not exists temp_coeff_sg_per_c numeric not null default 0;

comment on column devices.temp_coeff_sg_per_c is
  'Optional residual SG drift per degree C, for device-specific effects the standard liquid correction does not cover (mainly housing thermal expansion). Requires calibrating at two or more temperatures. 0 = unused.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'devices_calibration_temp_c_check') then
    -- Physically sane range. The correction polynomial itself is accurate
    -- roughly 0-40 C; outside that it degrades rather than failing loudly.
    alter table devices add constraint devices_calibration_temp_c_check
      check (calibration_temp_c between -10 and 50);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- The standard hydrometer temperature-correction polynomial
-- ---------------------------------------------------------------------------

-- The empirical curve homebrew calculators use (Lyons), defined in Fahrenheit.
-- It returns a relative density factor; only the RATIO of two evaluations is
-- meaningful, never the absolute value.
--
-- Accurate over roughly 0-40 C (32-104 F), which covers every fermentation
-- this product targets. It is not clamped: silently flattening the curve
-- outside that band would hide the inaccuracy rather than surface it.
create or replace function hydrometer_temp_factor(t_c numeric)
returns numeric
language sql
immutable
strict
set search_path = ''
as $$
  select 1.00130346
       - 1.34722124e-4 * (t_c * 9.0 / 5.0 + 32.0)
       + 2.04052596e-6 * power(t_c * 9.0 / 5.0 + 32.0, 2)
       - 2.32820948e-9 * power(t_c * 9.0 / 5.0 + 32.0, 3);
$$;

comment on function hydrometer_temp_factor(numeric) is
  'Relative density factor for the standard hydrometer temperature correction. Only ratios f(measured)/f(calibration) are meaningful. Accurate ~0-40C.';

-- ---------------------------------------------------------------------------
-- Rebuilt view
-- ---------------------------------------------------------------------------

-- Dropped rather than replaced: CREATE OR REPLACE VIEW can only append columns
-- at the end, and gravity_sg_raw belongs beside gravity_sg. Dropping discards
-- the grant, so it is re-issued below -- easy to forget, and the dashboard
-- fails closed with a permission error if it is.
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

  -- Uncorrected: the raw polynomial output, i.e. SG as this device reads at
  -- its calibration temperature. Exposed so the size of the correction is
  -- visible rather than buried, and so a suspect correction can be debugged.
  case
    when r.tilt_deg is null or d.calibration_c is null then null
    else coalesce(d.calibration_a, 0) * power(r.tilt_deg, 3)
       + coalesce(d.calibration_b, 0) * power(r.tilt_deg, 2)
       + d.calibration_c * r.tilt_deg
       + coalesce(d.calibration_d, 0)
  end as gravity_sg_raw,

  -- Corrected to a 20 C reference. This is the number to show a brewer.
  case
    when r.tilt_deg is null or d.calibration_c is null then null
    else (
      coalesce(d.calibration_a, 0) * power(r.tilt_deg, 3)
      + coalesce(d.calibration_b, 0) * power(r.tilt_deg, 2)
      + d.calibration_c * r.tilt_deg
      + coalesce(d.calibration_d, 0)
    )
    -- Liquid thermal expansion between measurement and calibration temperature.
    -- A missing temperature leaves the value uncorrected rather than null: the
    -- uncorrected number is still meaningful, just less accurate, and the
    -- firmware skips the whole cycle if the temperature read fails, so in
    -- practice this branch should never be taken.
    * case
        when r.temperature_c is null then 1
        else public.hydrometer_temp_factor(r.temperature_c)
           / public.hydrometer_temp_factor(d.calibration_temp_c)
      end
    -- Optional device-specific residual; zero unless explicitly calibrated.
    + case
        when r.temperature_c is null then 0
        else d.temp_coeff_sg_per_c * (r.temperature_c - d.calibration_temp_c)
      end
  end as gravity_sg,

  r.created_at
from readings r
join devices d on d.id = r.device_id;

grant select on readings_with_gravity to authenticated;
