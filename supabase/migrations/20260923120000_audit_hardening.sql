-- Audit hardening (docs/AUDIT-2026-09-23.md)
--
-- Moves validation into Postgres, where no UI bug can get around it, and
-- closes the data-exposure findings. Grouped by finding:
--
--   1. CHECK constraints on device config and on ingested data
--   2. Column-level privileges on devices (no more reading device_secret or
--      writing last_seen_at/claim_code/device_type from the browser)
--   3. Device secrets stored as SHA-256, not plaintext
--   4. Ownership epoch: a new owner sees only history from their own claim on
--   5. sensor_fault gets through a snooze ("never go silent")
--   6. latest_readings view for the device list
--   7. Waitlist: RPC with a per-IP rate limit, no direct anon insert
--   8. Alert webhook URL read from Vault; missing config warns instead of
--      failing silently (and never blocks the alert insert itself)
--   9. firmware_releases.sha256, checked by the device before flashing
--  10. prune_readings(): opt-in retention, not scheduled

-- ---------------------------------------------------------------------------
-- 1. CHECK constraints
-- ---------------------------------------------------------------------------

-- Pull any existing out-of-range config into range first, so the constraints
-- below can be added validated rather than NOT VALID.
update devices set sleep_interval_seconds = greatest(60, least(86400, sleep_interval_seconds))
 where sleep_interval_seconds not between 60 and 86400;
update devices set consecutive_breach_limit = greatest(1, least(100, consecutive_breach_limit))
 where consecutive_breach_limit not between 1 and 100;

do $$ begin
  -- A 0 here put a unit into a continuous wake loop (the firmware now clamps
  -- too, but the row itself should never hold it). 60s is the floor the
  -- dashboard form has always advertised; 24h is the ceiling past which the
  -- connection-status maths stops meaning anything.
  if not exists (select 1 from pg_constraint where conname = 'devices_sleep_interval_check') then
    alter table devices add constraint devices_sleep_interval_check
      check (sleep_interval_seconds between 60 and 86400);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'devices_breach_limit_check') then
    alter table devices add constraint devices_breach_limit_check
      check (consecutive_breach_limit between 1 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'devices_temp_range_check') then
    alter table devices add constraint devices_temp_range_check
      check (temp_min_c < temp_max_c and temp_min_c >= -40 and temp_max_c <= 125) not valid;
  end if;

  -- Ingested data. NOT VALID: enforced for every new row, without scanning
  -- (or failing on) history that predates it. -40..125 is the DS18B20 /
  -- MCP9808 rated range -- anything outside it is a wiring fault, not a
  -- temperature. The tilt maths (atan2 over |ax|) can only produce 0..90.
  if not exists (select 1 from pg_constraint where conname = 'readings_temperature_range_check') then
    alter table readings add constraint readings_temperature_range_check
      check (temperature_c between -40 and 125) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'readings_tilt_range_check') then
    alter table readings add constraint readings_tilt_range_check
      check (tilt_deg is null or tilt_deg between 0 and 90) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'readings_battery_range_check') then
    alter table readings add constraint readings_battery_range_check
      check (battery_v is null or battery_v between 0 and 10) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'alerts_reason_check') then
    alter table alerts add constraint alerts_reason_check
      check (reason in ('below_min', 'above_max', 'sensor_fault', 'battery_low')) not valid;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Column-level privileges on devices
-- ---------------------------------------------------------------------------

-- RLS decides WHICH rows a user touches; it says nothing about which columns.
-- Before this, an owner could read device_secret and write last_seen_at,
-- claim_code, device_type or the secret itself straight through PostgREST.
-- Table-level SELECT/UPDATE are replaced with per-column grants. (INSERT stays
-- table-level: "Add manually" has to set the secret once, and the trigger in
-- section 3 hashes it on the way in.)
revoke select, update on devices from authenticated;

grant select (
  id, user_id, name, device_type,
  temp_min_c, temp_max_c, consecutive_breach_limit, sleep_interval_seconds,
  last_seen_at, created_at, claimed_at,
  calibration_a, calibration_b, calibration_c, calibration_d,
  calibration_temp_c, temp_coeff_sg_per_c,
  battery_min_v, alerts_muted_until, notify_email,
  og_tilt_deg, og_temp_c, fermentation_started_at
) on devices to authenticated;

grant update (
  name,
  temp_min_c, temp_max_c, consecutive_breach_limit, sleep_interval_seconds,
  calibration_a, calibration_b, calibration_c, calibration_d,
  calibration_temp_c, temp_coeff_sg_per_c,
  battery_min_v, alerts_muted_until, notify_email,
  og_tilt_deg, og_temp_c, fermentation_started_at
) on devices to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Hash device secrets
-- ---------------------------------------------------------------------------

-- A dump of the devices table no longer hands out working credentials for
-- every unit. SHA-256 without a salt is enough here: the secrets are 128+ bit
-- random strings, not passwords, so there is nothing to dictionary-attack.
-- The 'sha256:' prefix makes hashed values self-describing, so the trigger
-- below can never double-hash.
create or replace function hash_device_secret(p_secret text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select 'sha256:' || encode(pg_catalog.sha256(convert_to(p_secret, 'UTF8')), 'hex');
$$;

revoke execute on function hash_device_secret(text) from public, anon, authenticated;

-- security definer: the trigger fires for an ordinary dashboard insert ("Add
-- manually"), and that role has no EXECUTE on hash_device_secret().
create or replace function devices_hash_secret()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.device_secret is not null and new.device_secret not like 'sha256:%' then
    new.device_secret := hash_device_secret(new.device_secret);
  end if;
  return new;
end;
$$;

drop trigger if exists devices_hash_secret on devices;
create trigger devices_hash_secret
  before insert or update of device_secret on devices
  for each row execute function devices_hash_secret();

-- Backfill: the trigger does the hashing.
update devices set device_secret = device_secret where device_secret not like 'sha256:%';

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
      and device_secret = hash_device_secret(p_device_secret)
  ) then
    raise exception 'invalid device credentials' using errcode = '28000';
  end if;
end;
$$;

revoke execute on function verify_device_secret(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Ownership epoch
-- ---------------------------------------------------------------------------

-- unclaim_device() keeps history attached to the device id, so whoever claimed
-- a second-hand unit could read every reading and alert the previous owner's
-- batches ever produced. Rows are now visible only from the current owner's
-- claim onward. claimed_at is null for units added manually (never claimed),
-- which fall back to created_at -- i.e. everything, as before.
drop policy if exists "users select own readings" on readings;
create policy "users select own readings" on readings
  for select to authenticated
  using (exists (
    select 1 from devices
    where devices.id = readings.device_id
      and devices.user_id = auth.uid()
      and readings.created_at >= coalesce(devices.claimed_at, devices.created_at)
  ));

drop policy if exists "users select own alerts" on alerts;
create policy "users select own alerts" on alerts
  for select to authenticated
  using (exists (
    select 1 from devices
    where devices.id = alerts.device_id
      and devices.user_id = auth.uid()
      and alerts.created_at >= coalesce(devices.claimed_at, devices.created_at)
  ));

drop policy if exists "users acknowledge own alerts" on alerts;
create policy "users acknowledge own alerts" on alerts
  for update to authenticated
  using (exists (
    select 1 from devices
    where devices.id = alerts.device_id
      and devices.user_id = auth.uid()
      and alerts.created_at >= coalesce(devices.claimed_at, devices.created_at)
  ))
  with check (exists (
    select 1 from devices
    where devices.id = alerts.device_id
      and devices.user_id = auth.uid()
  ));

-- Only `acknowledged` is meant to be writable on an alert.
revoke update on alerts from authenticated;
grant update (acknowledged) on alerts to authenticated;

-- The next owner also shouldn't inherit the previous owner's config: reset
-- the per-owner fields on release. Calibration stays -- it describes the
-- physical unit, not its owner.
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
         claim_code = v_code,
         name = 'Fermentation Monitor',
         alerts_muted_until = null,
         notify_email = true,
         og_tilt_deg = null,
         og_temp_c = null,
         fermentation_started_at = null
   where id = p_device_id
     and user_id = v_uid
  returning id into v_updated;

  if v_updated is null then
    raise exception 'Device not found, or you are not its owner' using errcode = 'P0002';
  end if;

  return v_code;
end;
$$;

revoke execute on function unclaim_device(text) from public, anon;
grant execute on function unclaim_device(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. A snooze no longer hides a dead sensor
-- ---------------------------------------------------------------------------

-- Snooze exists for deliberate temperature swings (a cold crash). A sensor
-- that stopped reading is not one of those, and hiding it would be exactly the
-- silent failure Product Principle 1 rules out.
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

  if p_reason <> 'sensor_fault' and alerts_muted(p_device_id) then
    return;
  end if;

  insert into alerts (device_id, temperature_c, reason)
  values (p_device_id, p_temperature_c, p_reason);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. latest_readings
-- ---------------------------------------------------------------------------

-- The device list used to pull the newest 500 readings across ALL devices and
-- reduce client-side, so a quiet device behind busy siblings showed "—" even
-- with readings on file. DISTINCT ON walks readings_device_id_created_at_idx.
create or replace view latest_readings
with (security_invoker = true)
as
select distinct on (device_id)
  id, device_id, temperature_c, battery_v, tilt_deg, created_at
from readings
order by device_id, created_at desc;

grant select on latest_readings to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Waitlist
-- ---------------------------------------------------------------------------

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'waitlist_email_check') then
    alter table waitlist add constraint waitlist_email_check
      check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'waitlist_comment_check') then
    alter table waitlist add constraint waitlist_comment_check
      check (comment is null or length(comment) <= 2000) not valid;
  end if;
end $$;

create table if not exists waitlist_attempts (
  id bigserial primary key,
  client_ip text not null,
  attempted_at timestamptz not null default now()
);
create index if not exists waitlist_attempts_ip_time_idx on waitlist_attempts (client_ip, attempted_at desc);
alter table waitlist_attempts enable row level security; -- no policies: RPC-only

-- Direct anon inserts had no limit at all. The landing page now goes through
-- this RPC, which caps each client IP at 5 signups an hour.
drop policy if exists "anyone can join waitlist" on waitlist;
revoke insert on waitlist from anon, authenticated;

create or replace function join_waitlist(p_email text, p_comment text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_headers json := nullif(current_setting('request.headers', true), '')::json;
  v_ip text := coalesce(
    split_part(v_headers ->> 'x-forwarded-for', ',', 1),
    v_headers ->> 'cf-connecting-ip',
    'unknown'
  );
  v_email text := lower(trim(coalesce(p_email, '')));
  v_comment text := nullif(trim(coalesce(p_comment, '')), '');
begin
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then
    return jsonb_build_object('ok', false, 'error', 'invalid_email');
  end if;

  delete from waitlist_attempts where attempted_at < now() - interval '1 day';
  if (select count(*) from waitlist_attempts
       where client_ip = v_ip and attempted_at > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('ok', false, 'error', 'too_many_attempts');
  end if;
  insert into waitlist_attempts (client_ip) values (v_ip);

  insert into waitlist (email, comment)
  values (v_email, left(v_comment, 2000))
  on conflict (email) do nothing;

  return jsonb_build_object('ok', true, 'already_joined', not found);
end;
$$;

revoke execute on function join_waitlist(text, text) from public;
grant execute on function join_waitlist(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Alert webhook config from Vault
-- ---------------------------------------------------------------------------

-- The URL used to be a 'YOUR_PROJECT' placeholder in a tracked migration:
-- applied as-is, every alert POSTed to a host that doesn't exist and no email
-- ever went out, with nothing saying so. Both values now come from Vault:
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/alert-notify',
--                              'alert_notify_function_url');
-- A missing value raises a WARNING (visible in the Postgres logs) and skips the
-- call. It never raises an error: that would roll back the alert insert
-- itself, trading a missing email for a missing alert.
create or replace function notify_alert_insert()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  webhook_secret text;
  function_url text;
begin
  select decrypted_secret into webhook_secret
    from vault.decrypted_secrets where name = 'alert_notify_webhook_secret';
  select decrypted_secret into function_url
    from vault.decrypted_secrets where name = 'alert_notify_function_url';

  if webhook_secret is null or function_url is null then
    raise warning 'alert-notify not configured (vault secrets alert_notify_webhook_secret / alert_notify_function_url); no email for alert %', new.id;
    return new;
  end if;

  perform net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', webhook_secret
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'alerts',
      'schema', 'public',
      'record', to_jsonb(new),
      'old_record', null
    )
  );

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Firmware integrity
-- ---------------------------------------------------------------------------

-- Hex SHA-256 of the uploaded .bin, computed by the admin console and written
-- into manifest.json. The firmware hashes the image as it streams and refuses
-- to boot one that doesn't match.
alter table firmware_releases add column if not exists sha256 text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'firmware_releases_sha256_check') then
    alter table firmware_releases add constraint firmware_releases_sha256_check
      check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 10. Retention (opt-in)
-- ---------------------------------------------------------------------------

-- readings grows by ~96 rows per device per day. Deleting brewers' history is
-- a product decision, so this is provided, not scheduled. To enable:
--   select cron.schedule('prune-readings', '17 3 * * *',
--                        $$select prune_readings(interval '365 days')$$);
create or replace function prune_readings(p_keep interval)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted bigint;
begin
  if p_keep < interval '30 days' then
    raise exception 'refusing to keep less than 30 days of readings';
  end if;
  delete from readings where created_at < now() - p_keep;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function prune_readings(interval) from public, anon, authenticated;
grant execute on function prune_readings(interval) to service_role;
