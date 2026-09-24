# Fermentation Monitor — Backend (Supabase)

Postgres schema, RLS policies, and the alert-email Edge Function backing
the firmware and dashboard.

## Schema overview

| Table | Purpose | Write access |
|---|---|---|
| `devices` | One row per physical unit: owner, `device_type`, thresholds, sleep interval, per-device secret, gravity calibration coefficients | Dashboard user (own rows only) |
| `readings` | Temperature/battery/tilt/humidity time series (`humidity_pct` is null except on the ESP32 Dev Kit V1 bench rig's DHT11) | Only via `ingest_reading()` RPC |
| `alerts` | Threshold-breach events | Only via `ingest_alert()` RPC (insert); dashboard user can update `acknowledged` |
| `waitlist` | Landing page pre-order/signup emails | Only via `join_waitlist()` RPC (validated, 5 signups/hour per client IP); nobody can read it via API |
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

## Device identity and claiming

A shipped unit can't have its secret typed in by the customer, so the flow
runs the other way round from the manual one:

1. **Factory** runs [`tools/provision.mjs`](../tools/README.md), which calls
   `provision_device(device_type, name)` with the **service_role** key. It returns `device_id`, `device_secret` and a
   single-use `claim_code`, and inserts the row with `user_id = null`.
2. The unit is flashed with the id + secret. The **claim code is printed on
   the unit**; the secret never leaves the factory.
3. **Customer** enters the code in the dashboard, which calls
   `claim_device(code)`. That sets `user_id = auth.uid()`, stamps
   `claimed_at`, and **clears the code** so it can't be replayed.

### Why an unclaimed device needs no new policy

All four RLS policies on `devices` test `user_id = auth.uid()`. NULL never
equals a uuid, so an unclaimed row is invisible to every user automatically —
and so are its readings, since `readings` is scoped through `devices.user_id`.
A provisioned-but-unclaimed unit can still post (the ingest RPCs check only
the device secret), and those readings simply become visible the moment
someone claims it.

### Security properties, all verified against the live project

| Property | Result |
|---|---|
| Unclaimed device visible to a signed-in user | 0 rows |
| Claim with messy input (`t9x9-b5n6`) | accepted — normalised server-side |
| Replay the same code from another user | rejected, device not stolen |
| Code that never existed | **identical** error — no enumeration signal |
| `provision_device` as a normal user | permission denied |
| `claim_device` as anon | permission denied |

The identical error for "wrong code", "already claimed" and "malformed" is
deliberate: distinguishing them would tell an attacker which guesses were real
device codes.

Claim codes are 8 characters from a 30-symbol alphabet (~39 bits) that omits
`0/O`, `1/I/L` and `U`, because the code gets read off a label and typed by
hand. Generation rejects byte values ≥ 240 so the modulo is unbiased; 2000
draws produced 2000 distinct well-formed codes using all 30 symbols.

### Rate limiting

`claim_device` allows **10 failed attempts per user per hour**, backed by the
`claim_attempts` table. At that rate, 39 bits of code space puts a 50% chance
of hitting any live code years away even across a thousand throwaway accounts.

**The implementation detail that matters:** the function *returns* failures
instead of raising them. Raising aborts the transaction, which rolls back the
attempt row written moments earlier — so a raise-based version counts nothing
and the limit silently does nothing at all. That is why `claim_device` returns
`jsonb` (`{ok, error, message, retry_after_seconds}`) rather than a bare text
id, and why only genuine faults like "not authenticated" still raise.

Two smaller choices:

- **A blocked attempt is not itself recorded**, or a client retrying in a loop
  would keep extending its own block indefinitely.
- **The limit is per-user, not global.** A global counter would let one
  attacker lock every customer out of claiming.

`claim_attempts` has RLS enabled with **no policies**, so no client can read
the log or forge entries; only the SECURITY DEFINER function, running as the
owner, touches it. Old rows are pruned inside the function (that user's own
rows, older than 24h) so it needs no scheduled job.

Verified against the live project: attempts 1–10 returned `invalid_code` and
the 11th returned `too_many_attempts` — proving the counter actually
accumulates rather than rolling back; a blocked user was refused even when
given a **valid** code; a different user claimed successfully at the same
moment, so the limit is genuinely per-user; the log returned 0 rows to a
client; and a client `DELETE` against it affected nothing, leaving the block
in force.

Email confirmation is on (`enable_confirmations = true` in `config.toml`;
match it in the hosted project under Authentication → Sign In / Providers →
Email), so minting throwaway accounts to multiply the quota now needs a real
inbox per account. It needs working SMTP to deliver the confirmation mail.

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
  WEBHOOK_SECRET=<the same value you stored in Vault below> \
  DASHBOARD_URL=https://your-dashboard.example.com
```

`WEBHOOK_SECRET` is **required**: with it unset the function refuses every
request (it used to skip the check, which made it an open relay that would
email any device's owner on request). The function also re-reads the alert
from the database by id instead of trusting the posted body.
`DASHBOARD_URL` is optional; with it set, each email links straight to the
device.

Store two Vault secrets as **one-off SQL Editor queries, not tracked
migrations** (so neither value lands in migration history):

```sql
select vault.create_secret(
  '<a random value, e.g. `openssl rand -hex 32`>',
  'alert_notify_webhook_secret',
  'Shared secret between the alerts-insert DB trigger and the alert-notify Edge Function'
);
select vault.create_secret(
  'https://<your-project-ref>.supabase.co/functions/v1/alert-notify',
  'alert_notify_function_url',
  'Where the alerts-insert trigger posts'
);
```

Use the first value for the `WEBHOOK_SECRET` function secret above. If either
Vault secret is missing, the trigger logs a `WARNING` naming the alert and
skips the email; it never blocks the alert insert itself.

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
- [x] Verify the TLS server in firmware (`ROOT_CA_PEM`); OTA refuses to run
      without it and checks each image's SHA-256 before booting it.
- [x] Store device secrets hashed (`hash_device_secret()`, applied by a
      trigger on insert/update, so provisioning and "Add manually" are
      unchanged).
- [x] Column-level grants on `devices`: the dashboard can't read
      `device_secret`/`claim_code` or write `last_seen_at`, `device_type`, or
      the secret. Select explicit columns (`DEVICE_COLUMNS` in the dashboard),
      never `*`.
- [x] Ownership epoch: RLS shows readings and alerts only from the current
      owner's `claimed_at` onward, so transferring a unit doesn't hand over
      the previous owner's history.
- [x] CHECK constraints on device config and ingested readings (see
      `20260923120000_audit_hardening.sql`).
- [ ] Opt-in retention: `prune_readings(interval)` exists (service role
      only) but isn't scheduled. Schedule it with `pg_cron` once you decide
      how long to keep history.
