-- Fires the alert-notify Edge Function whenever a row is inserted into
-- alerts, using pg_net for async HTTP calls from Postgres. This replaces
-- needing to click through Database > Webhooks in the dashboard -- the
-- whole thing is one migration.
--
-- Before applying this migration:
--   1. Store the shared webhook secret in Vault (do this once, via the SQL
--      editor -- NOT as a tracked migration, so the plaintext secret never
--      ends up in migration history):
--        select vault.create_secret(
--          '<a random value, e.g. `openssl rand -hex 32`>',
--          'alert_notify_webhook_secret',
--          'Shared secret between the alerts-insert DB trigger and the alert-notify Edge Function'
--        );
--   2. Set that same value as the alert-notify function's WEBHOOK_SECRET
--      secret (see supabase/README.md) so the function actually checks it.
--   3. Replace YOUR_PROJECT below with your project ref before applying.
create extension if not exists pg_net with schema extensions;

create or replace function notify_alert_insert()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  webhook_secret text;
  function_url text := 'https://YOUR_PROJECT.supabase.co/functions/v1/alert-notify';
begin
  select decrypted_secret into webhook_secret
  from vault.decrypted_secrets
  where name = 'alert_notify_webhook_secret';

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

drop trigger if exists alerts_notify_on_insert on alerts;
create trigger alerts_notify_on_insert
  after insert on alerts
  for each row execute function notify_alert_insert();
