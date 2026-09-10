# Fermentation Monitor — Backend (Supabase)

Postgres schema, RLS policies, and the alert-email Edge Function backing
the firmware and dashboard.

## Schema overview

| Table | Purpose | Write access |
|---|---|---|
| `devices` | One row per physical unit: owner, thresholds, sleep interval, per-device secret | Dashboard user (own rows only) |
| `readings` | Temperature/battery time series | Only via `ingest_reading()` RPC |
| `alerts` | Threshold-breach events | Only via `ingest_alert()` RPC (insert); dashboard user can update `acknowledged` |
| `waitlist` | Landing page pre-order/signup emails | Anyone can insert, nobody can read via API |

Firmware never touches `devices`/`readings`/`alerts` directly with the anon
key — see `verify_device_secret()`, `ingest_reading()`, `ingest_alert()`,
and `get_device_config()` in `migrations/20260910120000_init_schema.sql`.
Each call carries the device's own secret, checked server-side, so a leaked
anon key (which ships inside every physical unit) can't be used to read or
write another customer's device.

## Setup

1. Create a Supabase project (dashboard or `mcp/CLI: supabase projects create`).
2. Apply the migration:
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```
   or paste `migrations/20260910120000_init_schema.sql` into the SQL Editor.
3. Grab the project URL and `anon` key from Project Settings > API — these
   go into the firmware config and the dashboard's `.env`.
4. Add a device row for your first unit (via the dashboard's "Add device"
   flow once it's running, or directly in the SQL editor):
   ```sql
   insert into devices (id, user_id, device_secret, name)
   values ('ferm-monitor-001', '<your-auth-user-uuid>', '<random-secret>', 'Kitchen Kombucha');
   ```
   Put the same `id` and `device_secret` into the firmware's `DEVICE_ID` /
   `DEVICE_SECRET` constants before flashing.

## Alert emails (Edge Function)

`functions/alert-notify` sends an email via [Resend](https://resend.com)
whenever a row is inserted into `alerts`. It's wired up with a Postgres
trigger + `pg_net` (`migrations/20260910124500_alert_insert_webhook_trigger.sql`),
not the dashboard's Database Webhooks UI — the whole thing is version
controlled instead of a manual click-through.

```bash
supabase functions deploy alert-notify
supabase secrets set \
  RESEND_API_KEY=re_your_key \
  ALERT_FROM_EMAIL="alerts@yourdomain.com" \
  WEBHOOK_SECRET=<the same value you stored in Vault below>
```

Before applying `20260910124500_alert_insert_webhook_trigger.sql`:

1. Store the shared secret in Vault as a **one-off SQL Editor query, not a
   tracked migration** (so the plaintext value never lands in migration
   history):
   ```sql
   select vault.create_secret(
     '<a random value, e.g. `openssl rand -hex 32`>',
     'alert_notify_webhook_secret',
     'Shared secret between the alerts-insert DB trigger and the alert-notify Edge Function'
   );
   ```
2. Use that same value for the `WEBHOOK_SECRET` function secret above.
3. Edit `function_url` inside the migration's `notify_alert_insert()` to
   your project's actual Functions URL before applying it.

Without `RESEND_API_KEY` set, the function logs what it would have sent
instead of failing — useful for local testing before you have a Resend
account. Check delivery any time via `pg_net`'s response log:
```sql
select status_code, created, content from net._http_response order by id desc limit 5;
```

## Hardening checklist before a real pre-sold batch

- [x] Per-device secret checked server-side (not a shared anon key) — done
      via the RPC functions above.
- [x] RLS scoping dashboard reads to `devices.user_id = auth.uid()` — done.
- [x] Internal-only helper (`verify_device_secret`) not exposed as a public
      RPC — done; remember Postgres grants `EXECUTE` to `PUBLIC` by default,
      so locking down a SECURITY DEFINER function needs `revoke ... from
      public`, not just `from anon`.
- [ ] Rate-limit `ingest_reading`/`ingest_alert` per device (e.g. via a
      Postgres function checking recent row counts) so a malfunctioning or
      malicious unit can't flood the table.
- [ ] Rotate `device_secret` support from the dashboard (currently set once
      at device creation).
- [ ] Pin the OTA host's TLS certificate in firmware instead of
      `WiFiClientSecure::setInsecure()`.
