-- Device identity and claiming
--
-- Until now a device row was created by the customer, who then pasted the
-- generated secret into the firmware. That is backwards for anything shipped:
-- a customer cannot edit a sketch, and the secret must never pass through
-- their hands at all.
--
-- The flow this establishes: the factory provisions a row with a unique id,
-- secret and single-use claim code. The unit is flashed with the id + secret;
-- the claim code is printed on it. The customer types that code into the
-- dashboard and the device becomes theirs.

-- ---------------------------------------------------------------------------
-- An unclaimed device belongs to nobody
-- ---------------------------------------------------------------------------

-- All four RLS policies on `devices` test `user_id = auth.uid()`. NULL never
-- equals a uuid, so a row with a null owner is invisible to every user without
-- any new policy -- which is exactly the property an unprovisioned unit needs.
alter table devices alter column user_id drop not null;

-- Stored as 8 uppercase characters with no separator, so the lookup is a plain
-- indexed equality rather than a regexp over every row. The hyphen in
-- "ABCD-EFGH" is presentation only, added when printing and stripped on input.
alter table devices add column if not exists claim_code text;
alter table devices add column if not exists claimed_at timestamptz;

create unique index if not exists devices_claim_code_key
  on devices (claim_code) where claim_code is not null;

comment on column devices.claim_code is
  'Single-use code printed on the physical unit. Cleared when claimed, so it cannot be replayed to steal a device from its owner.';

-- ---------------------------------------------------------------------------
-- Claim code generation
-- ---------------------------------------------------------------------------

-- Alphabet excludes 0/O, 1/I/L and U: a code gets read off a label and typed by
-- hand, and those are the characters people get wrong. 30 symbols over 8
-- characters is ~39 bits, which is ample for a code that is also single-use
-- and rate-limited by being unguessable per-attempt.
create or replace function gen_claim_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  raw bytea;
  out_code text := '';
  b int;
  i int := 0;
begin
  raw := decode(replace(pg_catalog.gen_random_uuid()::text, '-', ''), 'hex');
  while length(out_code) < 8 loop
    if i > 15 then
      -- Exhausted this draw's bytes through rejection; take a fresh one.
      raw := decode(replace(pg_catalog.gen_random_uuid()::text, '-', ''), 'hex');
      i := 0;
    end if;
    b := get_byte(raw, i);
    i := i + 1;
    -- Reject the tail so the modulo is unbiased: 240 = 8 * 30.
    if b < 240 then
      out_code := out_code || substr(alphabet, (b % 30) + 1, 1);
    end if;
  end loop;
  return out_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- Factory provisioning -- service_role only
-- ---------------------------------------------------------------------------

create or replace function provision_device(
  p_device_type text default 'tilt',
  p_name text default 'Fermentation Monitor'
)
returns table (device_id text, device_secret text, claim_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
  v_secret text;
  v_code text;
begin
  v_id := 'ferm-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
  v_secret := replace(gen_random_uuid()::text, '-', '')
           || replace(gen_random_uuid()::text, '-', '');
  loop
    v_code := gen_claim_code();
    exit when not exists (select 1 from devices d where d.claim_code = v_code);
  end loop;

  insert into devices (id, user_id, device_secret, name, device_type, claim_code)
  values (v_id, null, v_secret, p_name, p_device_type, v_code);

  return query select v_id, v_secret, v_code;
end;
$$;

-- Postgres grants EXECUTE to PUBLIC by default, so revoking from anon alone
-- would leave this callable by every signed-in user -- and it mints devices.
revoke execute on function provision_device(text, text) from public;
revoke execute on function provision_device(text, text) from anon, authenticated;
grant execute on function provision_device(text, text) to service_role;

revoke execute on function gen_claim_code() from public;
revoke execute on function gen_claim_code() from anon, authenticated;
grant execute on function gen_claim_code() to service_role;

-- ---------------------------------------------------------------------------
-- Claiming -- authenticated users
-- ---------------------------------------------------------------------------

create or replace function claim_device(p_claim_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_id text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  -- Accept whatever the customer types: hyphens, spaces, lower case.
  v_code := upper(regexp_replace(coalesce(p_claim_code, ''), '[^A-Za-z0-9]', '', 'g'));

  update devices
     set user_id    = v_uid,
         claimed_at = now(),
         claim_code = null          -- single use
   where claim_code = v_code
     and user_id is null
  returning id into v_id;

  if v_id is null then
    -- Deliberately identical for "no such code", "already claimed" and
    -- "malformed": distinguishing them would tell an attacker which guesses
    -- were real device codes.
    raise exception 'That claim code is not valid, or the device has already been claimed'
      using errcode = 'P0002';
  end if;

  return v_id;
end;
$$;

revoke execute on function claim_device(text) from public;
revoke execute on function claim_device(text) from anon;
grant execute on function claim_device(text) to authenticated;
