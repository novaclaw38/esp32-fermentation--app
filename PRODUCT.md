# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: home brewers and kombucha makers who ferment in a vessel (carboy,
bucket, or kombucha jar) and want to monitor it remotely instead of opening
it or relying on a gut-check. The floating Temp + Gravity module and the
external-probe Hub cover two device shapes within the same audience;
nothing in the product distinguishes a separate secondary audience yet.

## Product Purpose

Reports temperature and, for the Temp + Gravity module, specific gravity
from inside an active fermentation continuously and remotely, and
proactively alerts the owner — on the dashboard and by email — when
something needs attention (temperature out of range, a failed sensor, a
low battery), instead of requiring them to manually check or guess.
Success is that the owner never opens the fermenter or takes a manual
hydrometer reading to know its state, and is warned before a problem
becomes a ruined batch rather than after.

## Positioning

Pre-launch product (not just a personal/open-source tool): a landing page
collects a waitlist, and a v2 custom PCB path is underway to replace the
DevKit-and-perfboard prototype for an eventual kit or assembled unit.
Positioned against Tilt Hydrometer, iSpindle, Plaato, and BrewPi — named
by the user as the comparison set. This product's confirmed mechanism
against that category: one floating device reports both temperature and
gravity (rather than requiring separate tools for each), ships a
first-party hosted/self-hostable dashboard with alerting and email built
in (rather than leaving visualization to a third-party app or DIY wiring),
and keeps the owner's data in a Supabase project they control rather than
a closed vendor cloud. No verified claims about competitors' specific
shortcomings are recorded here — only this product's own mechanism.

## Operating Context

Devices sit inside or alongside an active fermentation vessel in typical
home-fermentation settings: kitchen counter, closet, basement, or a
temperature-controlled chamber. They run on battery through deep-sleep
wake cycles (configurable interval, 900s default) and join WiFi through a
captive-portal setup flow, so an end customer never edits firmware or
touches credentials in code. Two device types exist: a Hub (external
DS18B20 probe, temperature only, optional humidity) and a floating Temp +
Gravity module (temperature plus tilt-derived specific gravity in one
sealed unit). Provisioning is factory-then-claim: a unit ships
pre-provisioned with a secret, and the owner claims it into their account
with an 8-character single-use code typed into the dashboard. The owner's
primary touchpoint is the web dashboard (live reading, 48h charts, alert
history, per-device settings); the secondary touchpoint is an alert email.

## Capabilities and Constraints

- Real-time temperature (all devices) and specific gravity via tilt angle
  plus a per-device calibration curve with temperature correction (Temp +
  Gravity module only)
- Threshold alerting (below-minimum / above-maximum), sensor-fault
  alerting (the device stays awake to report a failed reading instead of
  going silent), and low-battery alerting, each deduplicated so a
  standing problem doesn't spam new alerts
- Per-device alert snooze and a separate per-device email-notification
  toggle — snoozing hides the alert everywhere; the email toggle only
  affects the email
- A connection-status indicator scaled to each device's own sleep
  interval, not a fixed global threshold
- Device admin panel: rename, delete (cascades to history, confirmed by
  typing the device ID back), unclaim/transfer (mints a fresh claim code
  and releases ownership without touching history), threshold editing,
  gravity calibration entry
- A °C/°F display toggle that is display-only — every stored value and
  every editable threshold/calibration input stays in °C
- Multi-tenant via Supabase RLS: a user sees and controls only devices
  they've claimed; an unclaimed device (user_id null) is invisible to
  everyone, including whoever just released it
- Constraint: devices are battery-powered and wake infrequently (15
  minutes by default) — the UI needs to read as trustworthy with sparse,
  delayed data, not as a real-time-every-second feed
- Constraint: gravity readings require a per-device calibration curve
  before they mean anything; an uncalibrated Temp + Gravity module shows
  raw tilt angle, not specific gravity
- Undecided: final hardware form factor and BOM — the v2 custom PCB path
  is in progress, replacing the current DevKit-and-perfboard prototype

## Brand Commitments

None yet. "Fermentation Monitor" is a working, descriptive name, not a
settled brand — name, logo, tagline, and voice are all open for later
design work.

## Evidence on Hand

No testimonials, case studies, or press. A landing page collects a
waitlist, but no signup counts or figures were provided this session —
future work must not fabricate any. No pricing has been decided.

## Product Principles

1. Never go silent. A failed sensor or a dead battery surfaces as a
   visible alert, not a device that simply stops reporting — this is the
   product's founding bug fix, not a hypothetical.
2. One device replaces two. The Temp + Gravity module's whole value is
   combining tilt-derived gravity and temperature in a single floating
   unit, not a temperature probe plus a separate hydrometer.
3. The dashboard is the product, not an accessory. Unlike a DIY-only
   alternative, this ships hosted/self-hostable visualization, alerting,
   and email out of the box rather than leaving the owner to wire up
   their own.
4. Owned, not walled. The owner's data lives in a Supabase project they
   control (or self-host), with RLS-scoped multi-tenancy, rather than a
   closed vendor cloud.
5. Zero-friction provisioning. Claim-code handoff and a captive-portal
   WiFi flow mean a customer never edits firmware or touches credentials
   in code — that's the entire setup.

## Accessibility & Inclusion

No product-specific accessibility requirement established yet.
