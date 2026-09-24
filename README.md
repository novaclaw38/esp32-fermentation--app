# Fermentation Monitor

A WiFi fermentation monitor for homebrewers and kombucha makers: an ESP32
sensor node reports into Supabase, a React dashboard shows live readings
and alert history, and threshold breaches trigger an email.
Built per the Phase 1 MVP scope in [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md).

Two device designs: the **Hub** (external DS18B20 probe, sits outside the
fermenter, optional BME280 humidity) and the floating **Temp + Gravity
Module** — a sealed unit that floats *inside* the fermenter and reports
both temperature and specific gravity from its tilt angle. If you want
both readings, that's one device, not two.

**Live**: [dashboard](https://fermentation-monitor-dashboard.vercel.app) ·
[landing page](https://fermentation-monitor-landing.vercel.app) — both
deploy automatically from this branch via Vercel's GitHub integration.

```
sensor node (ESP32) --HTTPS--> Supabase (Postgres + RPCs + Edge Function) <--REST/Realtime-- React dashboard
                                        ^
                                        | insert-only
                              landing page waitlist form
```

## Repository layout

| Path | What it is |
|---|---|
| [`firmware/`](firmware/) | Two ESP32 Arduino sketches — the Hub (temperature) and the Temp + Gravity Module (temperature + tilt/gravity). Both deep-sleep between readings and support remote config + OTA |
| [`supabase/`](supabase/) | Postgres schema, RLS policies, device-authenticated RPCs, and the `alert-notify` Edge Function that emails on a new alert |
| [`dashboard/`](dashboard/) | React + TypeScript + Vite app: email/password auth, per-device live reading, 48h temperature chart, gravity chart + calibration for Temp + Gravity units, alert history, threshold editor |
| [`landing/`](landing/) | Static pre-order/signup page for the Phase 0 validation track |
| [`hardware/`](hardware/) | Custom PCB design (v2 hardware path) replacing the DevKit+perfboard BOM, plus humidity/gravity/CO₂ sensor modules — see [`hardware/MULTI_SENSOR_MODULES.md`](hardware/MULTI_SENSOR_MODULES.md). To build one on a breadboard today from off-the-shelf modules, start at [`hardware/PROTOTYPE_TEMP_GRAVITY.md`](hardware/PROTOTYPE_TEMP_GRAVITY.md) |
| [`docs/`](docs/) | The original implementation plan (hardware choice, BOM, phased rollout) |

## Getting it running end-to-end

1. **Backend**: create a Supabase project, apply
   `supabase/migrations/20260910120000_init_schema.sql`, then deploy and
   wire up `supabase/functions/alert-notify` per
   [`supabase/README.md`](supabase/README.md).
2. **Dashboard**: `cd dashboard && npm install`, copy `.env.example` to
   `.env` with your project's URL/anon key, `npm run dev`. Sign in, click
   "Add device" to generate a device ID + secret.
3. **Firmware**: open `firmware/fermentation_monitor_v1/fermentation_monitor_v1.ino`
   in the Arduino IDE, fill in the `CONFIG` section (WiFi, Supabase URL/anon
   key, the device ID + secret from step 2), flash to an ESP32 wired to a
   DS18B20 per [`firmware/README.md`](firmware/README.md).
4. **Landing page** (optional, for the Phase 0 validation track): fill in
   the Supabase config in `landing/index.html` and deploy the folder to any
   static host.
   - Both this and the dashboard are already deployed to Vercel from this
     branch (see the live links above), via projects
     `fermentation-monitor-dashboard` and `fermentation-monitor-landing`,
     git-linked to auto-deploy on every push. Vercel's deployment
     protection (SSO wall) is disabled on both so the public pages are
     actually reachable — the dashboard's real access control is Supabase
     auth/RLS, not Vercel's.
   - **Auth setup (done on this project, needed on a fresh one)**: turn off
     Authentication > Sign In / Providers > Email > **"Confirm email"** in
     Supabase. Sign-in works without it, but *creating* an account will
     otherwise sit waiting on a confirmation email that Supabase's built-in
     (heavily rate-limited) mail service may never deliver — which is what
     broke the original magic-link flow. Not settable via the Supabase
     API/MCP tools, only the dashboard.

     Verified working end-to-end against the live project: signup returns a
     session with no email sent, sign-in works, wrong passwords are
     rejected, and a signed-in user can add a device and read its readings
     back through RLS.

     **Turn confirmation back on once real SMTP is configured** — until
     then, someone can register an email address they don't own, and throwaway
     accounts multiply the claim-code rate limit. Configuring SMTP (Resend
     covers this and the `alert-notify` emails) is the fix. The local stack
     (`supabase/config.toml`) already has confirmation on, and the dashboard
     handles both modes: with confirmation off, signup signs you straight in;
     with it on, it tells you to check your inbox. "Forgot password?" also
     sends email, so it needs the same SMTP to be dependable.
5. **Custom PCB** (optional, for the Phase 2 pre-sold batch): once you're
   past the perfboard prototype, see [`hardware/PCB_DESIGN.md`](hardware/PCB_DESIGN.md)
   for the small-batch PCB that replaces the DevKit + perfboard + breakout
   modules — same firmware, no code changes needed.

Once the device is flashed and has WiFi, readings show up on its dashboard
page within one sleep interval (10 minutes by default), and an out-of-range
reading held for 3 consecutive wakes triggers an alert + email.

## Security model

The firmware never uses a single shared "master" key against the readings/
alerts tables. Every write goes through a `SECURITY DEFINER` Postgres RPC
(`ingest_reading`, `ingest_alert`, `get_device_config`) that first checks
the calling device's own secret. A leaked anon key — which ships inside
every physical unit — can't be used to read or spam another customer's
device. Dashboard reads are scoped by RLS to `devices.user_id = auth.uid()`.
See [`supabase/README.md`](supabase/README.md) for the full hardening
checklist before a real pre-sold batch.

## Status / what's implemented vs. still open

**Software is complete end to end and deployed.** Firmware
read/post/alert/deep-sleep cycle for both the Hub and the floating Temp +
Gravity unit, remote-configurable thresholds, optional OTA path, per-device
secret auth, Postgres schema + RLS, alert email via Edge Function, dashboard
with auth, device list, temperature chart, gravity chart and calibration
editor, and the landing page waitlist. Gravity is stored as raw tilt and
converted to SG on read, corrected to a 20 °C reference from each device's
recorded calibration temperature.

**No hardware has ever been built.** Every hardware document in this repo is
a design on paper. Two things in particular are assumptions, not results:
which accelerometer axis runs along the housing, and whether the float angle
sweeps usefully across 1.000–1.080. Both are answered by a ~$8–17 breadboard
rig — see [`hardware/PROTOTYPE_TEMP_GRAVITY.md`](hardware/PROTOTYPE_TEMP_GRAVITY.md).
Until then the temperature correction is verified as maths, not against real
liquid, and no accuracy figure can be quoted.

**Still open elsewhere** (see the "Known Gaps" sections in
`firmware/README.md` and `supabase/README.md`): CO₂ module firmware and its
schema/dashboard support; OTA unvalidated on real hardware; no per-device
rate limiting on the ingest RPCs; no device-secret rotation flow; and the OTA
TLS check uses `setInsecure()` rather than a pinned certificate.

**Commercially, read `docs/IMPLEMENTATION_PLAN.md` before pricing anything.**
KegLand's RAPT Pill ships at roughly $50 with both radios, a 5 bar pressure
rating and years of field-proven firmware. The plan's original $99–129 target
does not survive that, and the landing page no longer quotes a price.
