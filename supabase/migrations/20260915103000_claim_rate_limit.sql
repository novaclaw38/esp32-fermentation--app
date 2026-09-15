-- Rate-limit device claiming
--
-- claim_device() previously raised on a bad code. That looked fine and did
-- nothing: raising aborts the transaction, so any attempt row written before
-- the raise is rolled back with it and the counter never accumulates. A
-- rate-limited endpoint therefore cannot signal failure by raising -- it has to
-- return, so the record of the attempt commits. That is why the return type
-- changes from text to jsonb.

create table if not exists claim_attempts (
  id           bigserial primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now(),
  succeeded    boolean not null
);

create index if not exists claim_attempts_user_time_idx
  on claim_attempts (user_id, attempted_at desc);

-- RLS on with NO policies: no ordinary role can read or write this table at
-- all. claim_device() is SECURITY DEFINER and runs as the owner, which is not
-- subject to these policies, so it alone maintains the log.
alter table claim_attempts enable row level security;

comment on table claim_attempts is
  'Failed-claim log backing the rate limit. Only claim_device() touches it; RLS is enabled with no policies so no client can read or forge entries.';

-- Return type changes, so replace is not enough.
drop function if exists claim_device(text);

create or replace function claim_device(p_claim_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- 10 failures/hour. With ~39 bits of code space this leaves brute force
  -- implausible (years, even across many throwaway accounts) while still
  -- giving someone mistyping a label from a jar plenty of room.
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

  -- Keep the log bounded without a scheduled job. Only this user's rows, so
  -- the work stays proportional to their own activity.
  delete from claim_attempts
   where user_id = v_uid and attempted_at < now() - interval '24 hours';

  select count(*), min(attempted_at)
    into v_failures, v_oldest
    from claim_attempts
   where user_id = v_uid
     and not succeeded
     and attempted_at > now() - window_len;

  if v_failures >= max_failures then
    -- Deliberately NOT recorded: a blocked attempt must not extend the block,
    -- or a client retrying in a loop could lock itself out indefinitely.
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
         claim_code = null
   where claim_code = v_code
     and user_id is null
  returning id into v_id;

  insert into claim_attempts (user_id, succeeded) values (v_uid, v_id is not null);

  if v_id is null then
    -- One message for "no such code", "already claimed" and "malformed":
    -- telling them apart would confirm which guesses were real device codes.
    return jsonb_build_object(
      'ok', false,
      'error', 'invalid_code',
      'message', 'That claim code is not valid, or the device has already been claimed.'
    );
  end if;

  return jsonb_build_object('ok', true, 'device_id', v_id);
end;
$$;

revoke execute on function claim_device(text) from public;
revoke execute on function claim_device(text) from anon;
grant execute on function claim_device(text) to authenticated;
