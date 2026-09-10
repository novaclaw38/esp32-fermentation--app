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
whenever a row is inserted into `alerts`. It's triggered by a **Database
Webhook**, not a Postgres trigger, so no extension (`pg_net`) is required.

```bash
supabase functions deploy alert-notify
supabase secrets set \
  RESEND_API_KEY=re_your_key \
  ALERT_FROM_EMAIL="alerts@yourdomain.com" \
  WEBHOOK_SECRET=$(openssl rand -hex 32)
```

Then in the Supabase dashboard: **Database > Webhooks > Create a new hook**
- Table: `alerts`, Event: `Insert`
- Type: Edge Function → `alert-notify`
- Add header `x-webhook-secret` set to the same value as `WEBHOOK_SECRET`

Without `RESEND_API_KEY` set, the function logs what it would have sent
instead of failing — useful for local testing before you have a Resend
account.

## Hardening checklist before a real pre-sold batch

- [x] Per-device secret checked server-side (not a shared anon key) — done
      via the RPC functions above.
- [x] RLS scoping dashboard reads to `devices.user_id = auth.uid()` — done.
- [ ] Rate-limit `ingest_reading`/`ingest_alert` per device (e.g. via a
      Postgres function checking recent row counts) so a malfunctioning or
      malicious unit can't flood the table.
- [ ] Rotate `device_secret` support from the dashboard (currently set once
      at device creation).
- [ ] Pin the OTA host's TLS certificate in firmware instead of
      `WiFiClientSecure::setInsecure()`.
