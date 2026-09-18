-- Fermentation analytics: OG capture for ABV / attenuation / rate / stage
--
-- ABV, attenuation, and the process-stage state machine all need the batch's
-- true original gravity as their anchor. That can't be derived from whatever
-- readings the dashboard happens to have loaded -- DeviceDetail only fetches
-- the last 48h (see HISTORY_HOURS), so for any fermentation older than two
-- days the true OG has already scrolled out of that window. GravityChart's
-- own comment already flags exactly this trap for its own delta figure;
-- deriving OG from a display window would hit it for real money (a wrong
-- ABV number for every established batch).
--
-- So the RAW tilt + temperature that produced the first calibrated reading
-- of a batch are captured once, server-side, and persisted on the device
-- row -- independent of whatever the dashboard later chooses to fetch.
--
-- Deliberately raw, not the computed SG: this device's whole history is
-- already "gravity computed on read, not stored" (see the calibration-curve
-- comment in DeviceDetail.tsx) specifically so recalibrating fixes every past
-- reading at once. Storing a pre-computed OG would silently go stale the
-- next time someone recalibrates. Storing the raw pair instead means the
-- dashboard runs it through the SAME computeGravitySg() as every other
-- reading (lib/gravity.ts), so a recalibration corrects OG right along with
-- the rest of the batch's history, with no special-case handling anywhere.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table devices add column if not exists og_tilt_deg numeric;
alter table devices add column if not exists og_temp_c numeric;
alter table devices add column if not exists fermentation_started_at timestamptz;

comment on column devices.og_tilt_deg is
  'Raw tilt angle from the reading that started the current batch -- auto-captured by ingest_reading() on the first calibrated reading after a batch starts (device claim, or an explicit "start new batch" reset). NULL until then. Kept raw, not pre-computed as SG, so recalibrating the device corrects OG along with the rest of its history instead of going stale.';

comment on column devices.og_temp_c is
  'Temperature paired with og_tilt_deg, needed to run the same temperature-corrected gravity formula (computeGravitySg) that every other reading uses.';

comment on column devices.fermentation_started_at is
  'Set alongside og_tilt_deg/og_temp_c, to the timestamp of the reading that captured them. Anchors the fermentation-rate and plateau-completion windows.';

-- ---------------------------------------------------------------------------
-- claim_device -- a newly claimed device starts with no batch in progress
-- ---------------------------------------------------------------------------

-- claim_device() returns jsonb as of 20260915103000 (claim_rate_limit), not
-- text as of its original 20260915090000 definition -- rate limiting needs
-- to return on a bad code rather than raise, so the attempt row it just
-- wrote commits instead of rolling back with the exception. Same return
-- type here, so a straight replace (no drop) is fine; only the reset of the
-- three new batch-anchor columns is new.
create or replace function claim_device(p_claim_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  max_failures constant int := 10;
  window_len   constant interval := interval '1 hour';

  v_uid      uuid := auth.uid();
  v_code     text;
  v_id       text;
  v_failures int;
  v_oldest   timestamptz;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  delete from claim_attempts
   where user_id = v_uid and attempted_at < now() - interval '24 hours';

  select count(*), min(attempted_at)
    into v_failures, v_oldest
    from claim_attempts
   where user_id = v_uid
     and not succeeded
     and attempted_at > now() - window_len;

  if v_failures >= max_failures then
    return jsonb_build_object(
      'ok', false,
      'error', 'too_many_attempts',
      'retry_after_seconds',
        greatest(1, ceil(extract(epoch from (v_oldest + window_len - now())))::int),
      'message', 'Too many claim attempts. Wait a little and try again.'
    );
  end if;

  v_code := upper(regexp_replace(coalesce(p_claim_code, ''), '[^A-Za-z0-9]', '', 'g'));

  update devices
     set user_id    = v_uid,
         claimed_at = now(),
         claim_code = null,
         -- A new owner shouldn't inherit the previous brewer's batch anchor.
         og_tilt_deg = null,
         og_temp_c = null,
         fermentation_started_at = null
   where claim_code = v_code
     and user_id is null
  returning id into v_id;

  insert into claim_attempts (user_id, succeeded) values (v_uid, v_id is not null);

  if v_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'invalid_code',
      'message', 'That claim code is not valid, or the device has already been claimed.'
    );
  end if;

  return jsonb_build_object('ok', true, 'device_id', v_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- ingest_reading -- now also auto-captures the OG anchor
-- ---------------------------------------------------------------------------

-- Same 5-arg signature as 20260917090000; a straight replace. Battery-alert
-- logic is unchanged, just reading the device row once instead of twice.
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
  v_device devices%rowtype;
begin
  perform verify_device_secret(p_device_id, p_device_secret);

  insert into readings (device_id, temperature_c, battery_v, tilt_deg)
  values (p_device_id, p_temperature_c, p_battery_v, p_tilt_deg);

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

  -- Auto-capture the OG anchor: the first calibrated reading since it was
  -- last cleared (claim, or an explicit "start new batch" reset) locks in --
  -- every later reading is measured against this same anchor until the
  -- brewer starts a new batch.
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
