# Fermentation Monitor — Firmware

Two sketches, one per device type:

| Sketch | Device | Reads |
|---|---|---|
| [`fermentation_monitor_v1/`](fermentation_monitor_v1/) | **Hub** — sits outside the fermenter, probe in the liquid | Temperature, battery |
| [`fermentation_tilt_v1/`](fermentation_tilt_v1/) | **Temp + Gravity Module** — sealed, floats in the liquid | Temperature, tilt angle (→ gravity), battery |

They are separate sketches, not build variants — different sensors, different
wiring, different Supabase device type. Most of this README covers the Hub
sketch; see [Temp + Gravity Module sketch](#temp--gravity-module-sketch) at the
bottom for what differs.

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

## WiFi setup portal

A customer can't edit a sketch, so WiFi credentials don't live in the code.
On boot the device loads them from NVS flash; if there are none it starts its
own open access point named `FermentationMonitor-XXXXXX` (last three bytes of
the MAC, so several units in a room stay distinguishable). Join it from a
phone, the captive portal appears, pick a network and enter the password. The
device stores them and restarts onto the customer's WiFi.

**Three ways in, deliberately different:**

| Trigger | Covers |
|---|---|
| No credentials stored | A brand-new unit |
| Charger detected (`CHARGE_DETECT_PIN`) | A router change on a sealed unit with no button — putting it on charge *is* the setup gesture |
| 12 consecutive WiFi failures | The same case on hardware without charge detection |

The failure threshold is a dozen cycles, not two, on purpose: a brief outage
must not drop a mid-batch unit into AP mode. And the portal times out after
`PORTAL_TIMEOUT_MS` (5 min) and sleeps — it runs the radio continuously, so an
unbounded portal would flatten the cell on a unit that's simply out of range.

`CHARGE_DETECT_PIN` defaults to `-1` (disabled); the bench rig has no such
wiring. Set it if you fit charge indication.

**The compile-time `WIFI_SSID`/`WIFI_PASSWORD` still work** as a bench
fallback — they're used only when nothing is stored, so a dev rig behaves
exactly as before while a shipped unit starts its portal.

### The 2.4 GHz question, answered before it's asked

The portal says outright that only 2.4 GHz networks appear, because the ESP32
has no 5 GHz radio. Customers otherwise look for their network, don't see it,
and conclude the device is broken. It's the single most predictable support
ticket in the product.

### Identity is factory-set, not customer-set

`DEVICE_ID` and `DEVICE_SECRET` stay compile-time — that's correct, and it is
what "factory-flashed" means. What changed is where they come from:

```sql
-- with the service_role key, once per physical unit
select * from provision_device('tilt', 'Fermentation Monitor');
--  device_id | device_secret | claim_code
```

Flash the id and secret into the sketch, print the **claim code** on the unit,
and the customer enters that code in the dashboard to take ownership. The
secret never reaches them. See `supabase/README.md` for the claim flow and
its verified security properties.

For your own bench units nothing changes: the dashboard's **Add manually**
path still creates a device and shows you a secret to paste in.

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
- **The Hub sketch does not drive the battery-divider enable pin.** That's
  deliberate: the current DevKit/perfboard prototype wires the divider
  straight to `BAT+` with no gating transistor, so there's nothing to
  drive. When you build the Hub PCB from `hardware/PCB_DESIGN.md`, port the
  `BATTERY_EN_PIN` handling out of `fermentation_tilt_v1` — it's already
  written and correct there (including the settling delay).

---

## Temp + Gravity Module sketch

`fermentation_tilt_v1/` targets the sealed floating module
(`hardware/schematic-gravity-module.html`). Everything above about board
settings, libraries, config placeholders, and OTA applies unchanged. What's
different:

### Extra library

- **Wire** (I²C) — bundled with the ESP32 core, no install needed. The
  ADXL345 is driven directly through `Wire` rather than a sensor library:
  it's a presence check, two register writes, and one 6-byte burst read,
  which isn't worth a dependency.

### Wiring differences

| | Hub | Temp + Gravity |
|---|---|---|
| DS18B20 | External waterproof probe via JST | Potted against the housing wall, no connector |
| Accelerometer | — | ADXL345 on `GPIO21`/`GPIO22`, SDO→GND (addr `0x53`) |
| Battery divider | Ungated (prototype) | Gated via `GPIO25` → Q2 → Q1 |

### What it posts

`{temperature_c, tilt_deg, battery_v}` — **raw tilt angle, not gravity**.
Specific gravity is computed on read by the `readings_with_gravity` view
using per-device calibration coefficients on the `devices` row, so
recalibrating a device fixes its entire history instead of leaving wrong
values baked into stored rows.

### Temperature sensor: MCP9808 or DS18B20

The sketch supports both and picks at boot, so one binary runs on the bench
rig and the production board:

- **MCP9808** (production) — I²C at `0x18`, sharing the ADXL345's bus.
  ±0.25 °C, cheaper than a DS18B20, no extra GPIO and no 1-Wire pull-up.
  Read at full 0.0625 °C resolution, then shut down between wakes (~200 µA
  running vs ~0.1 µA asleep — trivial while awake, but this board sleeps
  99.5% of the time).
- **DS18B20** (fallback) — used when no MCP9808 answers. Bench rigs are
  usually wired with a probe, and some housings suit a discrete sensor glued
  to the wall better than a thermally bonded PCB.

Detection checks the MCP9808's manufacturer ID (`0x0054`), not just an I²C
ACK, so another device at `0x18` can't be mistaken for one. The serial log
says which was found on every boot.

**Whichever is fitted, thermal coupling to the housing wall decides the
accuracy** — by far more than the part's datasheet. A ±0.25 °C sensor reading
the enclosure's still internal air is worse than a ±0.5 °C one bonded to the
wall. That matters for the customer-facing reading; for gravity itself the
sensitivity is only ~0.21 points per °C, so even ±0.5 °C costs ±0.11 gravity
points against a ±2 point target.

### Calibrating a unit

1. Flash it, seal it, and confirm the serial log prints a sane tilt angle:
   near 0° held upright, near 90° laid flat. **If it's inverted or pinned
   near 90°, the board's long axis isn't X** — change which axis
   `readTiltDegrees()` treats as the long one. Do this before collecting any
   calibration points; a wrong axis makes every later step garbage.
2. Float it in a few sugar solutions of known gravity, recording the tilt
   angle it reports for each. Three or four points spanning ~1.000–1.080 is
   enough. **Hold all the solutions at the same temperature, measure that
   temperature, and write it down** — step 4 depends on it.

   Use hydrometer readings already corrected to 20 °C (or a refractometer, or
   solutions of known gravity). The curve you're fitting maps tilt to *true*
   gravity; feeding it uncorrected hydrometer readings bakes a temperature
   error into the curve itself, which no later correction can undo.
3. Fit a polynomial (`SG = a·tilt³ + b·tilt² + c·tilt + d`) and write the
   coefficients to that device's `calibration_a`…`calibration_d` columns.
   Set the unused higher terms to `0` for a linear or quadratic fit.
4. **Set `calibration_temp_c` to the temperature from step 2.** Readings are
   corrected to a 20 °C reference, and that correction is measured *from this
   value* — not from an assumed 20 °C. If you calibrated at 24 °C and leave
   this at the default 20, every reading is quietly biased by about half a
   gravity point. The dashboard's calibration form has a field for it.

Both are editable from the device page in the dashboard; no SQL needed.

Until `calibration_c` is set, the view returns `null` gravity rather than a
plausible-looking wrong number.

#### Temperature correction

Gravity is corrected to a 20 °C reference using the standard hydrometer
curve, applied relative to `calibration_temp_c`. Across 5–35 °C that is worth
roughly −1.9 to +4.3 gravity points — the difference between calling a batch
finished at 1.010 and still working at 1.014.

The correction models the **liquid's** thermal expansion, which dominates and
needs no extra calibration. It does not model the **device's** own: a plastic
housing expands far more than a glass hydrometer, so its displaced volume, and
therefore its buoyancy, shifts measurably over a 20 K swing. That part is
housing-specific and can only be measured. If you calibrate at two
temperatures and find a residual slope, put it in `temp_coeff_sg_per_c`
(SG per °C); it defaults to 0 and is a no-op until then.

Both the raw and corrected values are exposed (`gravity_sg_raw` and
`gravity_sg`), so the size of the correction is visible rather than buried.

**This correction is untested against real liquid.** The maths is verified —
the Postgres view and the dashboard's client-side copy agree to five decimal
places across 5–35 °C — but no physical unit has ever floated in anything.

### Known gaps specific to this sketch

- **The tilt axis assumption is unverified** — see calibration step 1. The
  code comments say so at the point it matters, but nothing has been on real
  hardware yet.
- **Disturbance rejection is crude.** A reading whose acceleration magnitude
  isn't within 0.8–1.2 g is discarded as "someone bumped it," which catches
  handling but not slow sloshing. If real batches turn out noisy, a median
  of several bursts spread over a minute would beat the current single
  averaged burst.
- **No gravity-based alerting** (e.g. "fermentation stalled"). That needs
  trend history across readings, which belongs in a backend job, not
  firmware.
- **The device's own thermal expansion is not modelled by default.** The
  standard correction covers the liquid; `temp_coeff_sg_per_c` exists for the
  housing but stays 0 until someone calibrates at two temperatures and
  measures it.
