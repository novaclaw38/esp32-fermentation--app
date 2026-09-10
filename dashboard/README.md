# Fermentation Monitor — Dashboard

React + TypeScript + Vite dashboard: magic-link auth, per-device live
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
your Supabase project, and email auth enabled (default on) so magic-link
sign-in works.

## Structure

- `src/lib/supabaseClient.ts` — Supabase client, reads `VITE_SUPABASE_*` env vars
- `src/lib/auth.tsx` — session context (`useAuth()`), backs `ProtectedRoute`
- `src/pages/Login.tsx` — magic-link sign-in
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
