# Fermentation Monitor — Dashboard

React + TypeScript + Vite dashboard: email/password auth, per-device live
reading, 48h temperature chart, alert history/acknowledgement, and a
threshold editor that the firmware picks up on its next wake cycle. Temp +
Gravity units additionally get a gravity chart and a calibration editor.

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
- `src/pages/DeviceDetail.tsx` — live reading, charts, alerts, threshold form;
  subscribes to Supabase Realtime so new readings/alerts appear without a
  page refresh
- `src/components/` — `TemperatureChart` (recharts), `GravityChart`,
  `AlertList`, `ThresholdForm`, `CalibrationForm`
- `src/lib/gravity.ts` — client-side mirror of the `readings_with_gravity`
  view's polynomial (see below)

## Gravity (Temp + Gravity units only)

A device created as **Temp + Gravity** (`device_type = 'tilt'`) gets two
extra sections on its detail page: a gravity chart and a calibration form.
Hub devices are unaffected — nothing extra renders and nothing extra loads.

`DeviceDetail` reads from the `readings_with_gravity` view rather than the
`readings` table. The view carries the same columns plus `gravity_sg`,
which Postgres derives from the device's calibration curve at read time.
It's declared `security_invoker`, so RLS still scopes rows to the owner.

### Two things worth knowing before changing this code

**Realtime can't use the view.** `postgres_changes` replicates *tables*, and
a view emits no replication events. A live reading therefore arrives as raw
`tilt_deg` with no gravity attached, and the page applies the curve itself
via `lib/gravity.ts`. That file is a deliberate duplicate of the view's SQL
expression — if you change the polynomial in the migration, change it there
too, or live readings will silently disagree with reloaded ones.

**Gravity is corrected to 20 °C, relative to the calibration temperature.**
`devices.calibration_temp_c` records what the reference solutions were at when
the tilt→SG curve was fitted, and the standard hydrometer correction is applied
from *that* baseline — not from an assumed 20 °C. A device calibrated at 24 °C
but left at the default 20 is biased on every reading, silently, which is why
the calibration form requires the field. The chart shows the raw and corrected
values side by side so the size of the correction is visible.

**Uncalibrated devices chart tilt, not gravity.** With no curve, every
`gravity_sg` is null and a gravity chart would be blank. The chart instead
plots the raw tilt angle and says plainly that the numbers aren't SG — the
trend is still real, just on an arbitrary scale. Entering the coefficients
switches it to SG for the entire history at once, because gravity is
computed on read rather than stored. That is the whole reason for storing
raw tilt: recalibrating a unit corrects its past readings instead of
leaving a wrong curve baked into every stored row.

### What the chart deliberately doesn't show

No ABV or apparent-attenuation figure. Both need the batch's true original
gravity, and the first point in a 48-hour window is only that if the batch
is under two days old. For any established batch the number would be
confidently wrong, so the summary reports the change across the displayed
window and says that's what it is.

## Realtime

`DeviceDetail` subscribes to `postgres_changes` on `readings` and `alerts`
filtered to the current device. Enable Realtime on those two tables in the
Supabase dashboard (Database > Replication) if inserts aren't showing up
live — it's off by default on new projects.

## Build

```bash
npm run build   # tsc + vite build, outputs dashboard/dist
```

## Deploying: the SPA rewrite is required

`vercel.json` rewrites every unmatched path to `/index.html`:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

Without it the site 404s on every route except `/`. React Router resolves
`/login`, `/devices` and `/devices/:id` in the browser, but no file of that
name exists in `dist/`, so a direct visit or a page refresh asks the host for
a path it cannot serve. The root works, which makes the app look deployed
while every deep link is broken.

Vercel checks the filesystem *before* applying rewrites, so real files —
`/assets/index-*.js`, `/assets/index-*.css` — are still served normally and
only genuinely missing paths fall through to `index.html`. Any static host
needs the equivalent: `try_files $uri /index.html` on nginx, a 404-to-
index.html fallback on S3/CloudFront.
