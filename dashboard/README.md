# Fermentation Monitor — Dashboard

React + TypeScript + Vite dashboard: email/password auth, per-device live
reading, 48h temperature chart, alert history/acknowledgement, and a
threshold editor that the firmware picks up on its next wake cycle.

## Setup

```bash
cd dashboard
npm install
cp .env.example .env   # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

Requires the schema in `../supabase/migrations` to already be applied to
your Supabase project, and email auth enabled (default on).

### Turn off "Confirm email"

Sign-in works out of the box. **Creating** an account does not, unless you
turn off Authentication → Sign In / Providers → Email → "Confirm email" in
the Supabase dashboard.

This project originally used magic links, which broke for exactly this
reason: every sign-in depended on Supabase's built-in mail service, which
is rate-limited to a handful of messages an hour and isn't meant for
production. Password auth removes that dependency from sign-in entirely —
but signup still sends a confirmation mail unless you disable it. With it
off, `signUp()` returns a session immediately and no mail is ever sent.

The login page detects this case: if signup succeeds but returns no
session, it says so instead of appearing to do nothing.

Turn confirmation back on once you've configured real SMTP (Authentication
→ Emails → SMTP Settings) — until then, unverified addresses mean someone
could register an email they don't own.

Password *reset* also needs working SMTP, so there's deliberately no
"forgot password" link yet — it would be a dead end. Reset a password from
the Supabase dashboard (Authentication → Users) in the meantime.

## Structure

- `src/lib/supabaseClient.ts` — Supabase client, reads `VITE_SUPABASE_*` env vars
- `src/lib/auth.tsx` — session context (`useAuth()`), backs `ProtectedRoute`
- `src/pages/Login.tsx` — email/password sign-in and account creation
- `src/pages/Devices.tsx` — device list + "Add device" (generates the
  per-device secret shown once, to paste into the firmware)
- `src/pages/DeviceDetail.tsx` — live reading, chart, alerts, threshold form;
  subscribes to Supabase Realtime so new readings/alerts appear without a
  page refresh
- `src/components/` — `TemperatureChart` (recharts), `AlertList`,
  `ThresholdForm`

## Realtime

`DeviceDetail` subscribes to `postgres_changes` on `readings` and `alerts`
filtered to the current device. Enable Realtime on those two tables in the
Supabase dashboard (Database > Replication) if inserts aren't showing up
live — it's off by default on new projects.

## Build

```bash
npm run build   # tsc + vite build, outputs dashboard/dist
```
