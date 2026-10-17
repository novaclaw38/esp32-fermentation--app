FERMENTATION MONITOR
====================

A WiFi fermentation monitor for homebrewers and kombucha makers. An ESP32 sensor node
reports into Supabase, a React dashboard shows live readings and alert history, and
threshold breaches trigger an email.

Two device designs:
- Hub: external DS18B20 temperature probe (optional BME280 humidity).
- Temp + Gravity Module: a sealed unit that floats inside the fermenter and reports
  temperature and specific gravity from its tilt angle.

ARCHITECTURE
------------
  ESP32 sensor node --HTTPS--> Supabase (Postgres + RPCs + Edge Function)
                                   ^ REST/Realtime        ^ insert-only
                              React dashboard        landing page waitlist

PROJECT LAYOUT
--------------
  firmware/      Two ESP32 Arduino sketches (deep sleep, remote config, OTA)
  supabase/      Schema, RLS policies, device-authenticated RPCs, alert-notify Edge Function
  dashboard/     React + TypeScript + Vite app: auth, devices, charts, calibration, alerts
  landing/       Static pre-order / signup page
  hardware/      Custom PCB design and sensor module notes, breadboard prototype guide
  datasheets/, sourcing/, architecture/, pdf/, docs/   Planning and reference material
  SPEC.md, PRODUCT.md, DESIGN.md                      Product and design documents

GETTING STARTED
---------------
1. Create a Supabase project and apply supabase/migrations/20260910120000_init_schema.sql,
   then deploy the alert-notify function (see supabase/README.md).
2. Dashboard: cd dashboard && npm install, copy .env.example to .env with your Supabase
   URL and anon key, then npm run dev. Add a device to get a device ID and secret.
3. Firmware: open firmware/fermentation_monitor_v1 in the Arduino IDE, fill in the CONFIG
   section (WiFi, Supabase, device ID and secret), flash an ESP32 wired to a DS18B20.

SECURITY MODEL
--------------
Devices never write tables directly. Every write goes through a SECURITY DEFINER RPC that
checks the device's own secret, and dashboard reads are scoped by row-level security.

STATUS
------
Software is implemented end to end. No hardware has been built; the hardware documents are
designs on paper. See README.md and docs/IMPLEMENTATION_PLAN.md before pricing anything.
