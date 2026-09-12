# Fermentation Monitor — Backend (Supabase)

Postgres schema, RLS policies, and the alert-email Edge Function backing
the firmware and dashboard.

## Schema overview

| Table | Purpose | Write access |
|---|---|---|
| `devices` | One row per physical unit: owner, `device_type`, thresholds, sleep interval, per-device secret, gravity calibration coefficients | Dashboard user (own rows only) |
| `readings` | Temperature/battery/tilt time series | Only via `ingest_reading()` RPC |
| `alerts` | Threshold-breach events | Only via `ingest_alert()` RPC (insert); dashboard user can update `acknowledged` |
| `waitlist` | Landing page pre-order/signup emails | Anyone can insert, nobody can read via API |
| `readings_with_gravity` (view) | `readings` plus `gravity_sg` (corrected to 20 °C) and `gravity_sg_raw` (uncorrected), computed from each device's calibration curve | Read-only; `security_invoker = true` so RLS still applies |

### Gravity is computed on read, not stored

The Temp + Gravity Module posts a raw `tilt_deg`; the
`readings_with_gravity` view applies that device's calibration polynomial
(`SG = a·tilt³ + b·tilt² + c·tilt + d`, from the `calibration_*` columns on
`devices`), then corrects the result for temperature. Recalibrating a unit
therefore corrects its entire history instead of leaving wrong values baked
into stored rows. Gravity reads `null` until `calibration_c` is set, rather
than returning a plausible-looking wrong number.

### Temperature correction

`hydrometer_temp_factor(t_c)` implements the standard hydrometer correction
curve, and the view applies it as a ratio:

```
gravity_sg = poly(tilt)
           * hydrometer_temp_factor(reading temp) / hydrometer_temp_factor(calibration temp)
           + temp_coeff_sg_per_c * (reading temp - calibration temp)
```

**The correction is measured from `devices.calibration_temp_c`, not from a
hardcoded 20 °C.** The polynomial's output is "SG as this device reads at the
temperature its reference solutions were at", so that is the baseline the
measurement has to be corrected away from. A device calibrated at 24 °C but
left at the default 20 is biased on every reading, silently — which is why
the column is `not null` and the dashboard form requires it.

Across 5–35 °C the correction is worth about −1.9 to +4.3 gravity points.

`temp_coeff_sg_per_c` is an optional per-device residual for effects the
liquid correction doesn't model — mainly the housing's own thermal expansion,
which is far larger in plastic than in a glass hydrometer. It defaults to 0
and stays a no-op until someone calibrates at two temperatures.

`gravity_sg_raw` exposes the uncorrected polynomial output alongside the
corrected value, so the size of the correction is auditable rather than
buried.

One trap when changing this view: `CREATE OR REPLACE VIEW` can only append
columns at the end, so adding `gravity_sg_raw` beside `gravity_sg` required a
`DROP` + `CREATE` — **which discards the grant**. Re-issue
`grant select on readings_with_gravity to authenticated` or the dashboard
fails with a permission error. Re-check `security_invoker = true` after any
such rebuild too; losing it would hand every caller every user's readings.

The view is declared `with (security_invoker = true)`. Without that, it
would run as its owner and return every device's readings to any caller,
bypassing the RLS policies on `readings` entirely — worth keeping in mind
for any future view over these tables.

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
