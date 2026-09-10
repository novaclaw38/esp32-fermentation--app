# Fermentation Monitor — v1 Firmware

Arduino/C++ firmware for the ESP32 + DS18B20 temperature monitoring node.

## Required Arduino Libraries

Install via Arduino IDE Library Manager (Sketch > Include Library > Manage Libraries):

- **OneWire** by Paul Stoffregen
- **DallasTemperature** by Miles Burton

Board support: install the **ESP32 by Espressif Systems** board package via
Boards Manager if not already installed. `HTTPUpdate` and `WiFiClientSecure`
ship with the ESP32 core, no extra install needed.

## Board Settings

- Board: your specific ESP32 DevKit variant (e.g. "ESP32 Dev Module")
- Upload speed: 115200 (safe default)
- Flash frequency / partition scheme: defaults are fine for this sketch
  (pick a partition scheme with OTA space, e.g. "Default" or "Minimal SPIFFS",
  if you plan to use `OTA_ENABLED`)

## Wiring

- DS18B20 data line → GPIO4, with a 4.7kΩ pull-up resistor between data and 3V3
- DS18B20 VCC → 3V3, GND → GND
- Battery voltage divider: BAT+ → 100kΩ → GPIO34 → 100kΩ → GND (GPIO34 is
  input-only/ADC1, safe to read during WiFi TX)

## Before Flashing — Edit the CONFIG Section

Open `fermentation_monitor_v1/fermentation_monitor_v1.ino` and fill in:

1. `WIFI_SSID` / `WIFI_PASSWORD`
2. `SUPABASE_URL` — your project's REST URL (Project Settings > API)
3. `SUPABASE_ANON_KEY` — the `anon` key. This key alone cannot read or write
   any device data — every write goes through a `SECURITY DEFINER` RPC
   function that also checks `DEVICE_SECRET` server-side (see
   `supabase/migrations`), so a leaked anon key can't be used to spam or
   read another customer's readings.
4. `DEVICE_ID` / `DEVICE_SECRET` — created when you add the device from the
   dashboard ("Add device"). Unique per physical unit — never reuse a
   secret across units.
5. `TEMP_MIN_C` / `TEMP_MAX_C` — only used as the very first boot default.
   After that, thresholds set from the dashboard are fetched each wake
   cycle via `get_device_config` and take over.

OTA (`OTA_ENABLED`, `OTA_MANIFEST_URL`, `FIRMWARE_VERSION`) is optional and
off by default — see "Firmware OTA updates" below before enabling it.

## Behavior Summary

- Wakes every `SLEEP_INTERVAL_SECONDS` (default 600s / 10 min, server-
  configurable from the dashboard), reads temp, fetches remote config,
  posts the reading, checks thresholds, sleeps again.
- Uses deep sleep + RTC memory so consecutive-breach counting and the OTA
  check cadence survive between wake cycles without keeping the
  radio/CPU on.
- Alerts fire once per breach episode (not every cycle while still out of
  range) via the `alertActive` latch, and reset automatically once the
  reading returns to range.
- If WiFi or a Supabase call fails, the device does NOT loop/retry
  aggressively — it just sleeps and tries again next cycle. This protects
  battery life at the cost of a delayed alert/config-sync during outages.

## Battery Voltage Monitoring

v1 includes a 100kΩ/100kΩ resistor divider from BAT+ (the 18650's positive
terminal, before the TP4056 output) into GPIO34, an input-only ADC pin.
This halves the ~3.0-4.2V battery range down into the ESP32's safe ADC
input window, and the firmware multiplies the reading back up.

Treat this as a "low battery" warning signal, not a precision fuel gauge —
the ESP32's ADC is somewhat nonlinear near its rails. Calibrate the first
unit against a multimeter reading and adjust the multiplier in
`readBatteryVoltage()` if it's consistently off.

## Remote-configurable thresholds

Each wake cycle (while WiFi is up) the firmware calls the `get_device_config`
RPC with `DEVICE_ID` + `DEVICE_SECRET` and applies whatever `temp_min_c`,
`temp_max_c`, `consecutive_breach_limit`, and `sleep_interval_seconds` are
stored for that device row. Editing these from the dashboard's device
settings page takes effect on the device's next wake — no re-flash needed.

## Firmware OTA updates

Set `OTA_ENABLED = true` and host two files over HTTPS (a public Supabase
Storage bucket works well):

- `manifest.json`: `{"version": 2, "url": "https://.../firmware.bin"}`
- `firmware.bin`: exported via Arduino IDE Sketch > Export Compiled Binary

Bump `FIRMWARE_VERSION` in the `.ino` to match the manifest before each
release you publish. The device checks the manifest roughly once a day
(`OTA_CHECK_EVERY_N_CYCLES`) and self-updates + reboots if the manifest's
version is newer. `WiFiClientSecure::setInsecure()` is used for simplicity
in v1 — pin the actual CA certificate before shipping a large field batch,
since `setInsecure()` accepts any TLS certificate.

## Known Gaps / Next Steps (flag to founder, not silent assumptions)

- **OTA is implemented but untested on real hardware** — validate the full
  update flow (manifest fetch → download → flash → reboot) on a bench unit
  before relying on it for field units, and consider pinning the OTA host's
  CA certificate instead of `setInsecure()`.
- **No retry/backoff tuning yet** — WiFi timeout and sleep interval are
  reasonable defaults but not battery-life tested on real hardware.
- **JSON parsing is a hand-rolled substring extractor**, not a real JSON
  library — fine for the small, fixed-shape RPC responses used here, but
  don't extend it for anything more complex without switching to
  ArduinoJson.
