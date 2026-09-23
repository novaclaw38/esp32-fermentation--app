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

Hub with a DHT11 instead of the probe (see
[Using a DHT11](#using-a-dht11-instead-of-the-ds18b20-probe)): install
**DHT sensor library** by Adafruit instead of the two above.

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

### Using a DHT11 instead of the DS18B20 probe

The Hub sketch can read a DHT11 instead. Set `#define TEMP_SENSOR_DHT11 1`
near the top of `fermentation_monitor_v1.ino` and install **DHT sensor
library** by Adafruit (the Library Manager also offers to install **Adafruit
Unified Sensor**, which it needs). You don't need OneWire or
DallasTemperature in this mode.

Wiring uses the same pin as the probe:

- DHT11 DATA → GPIO4, VCC → 3V3, GND → GND
- A 3-pin DHT11 module already has its pull-up on the board. A bare 4-pin
  sensor needs one between DATA and 3V3. The 4.7kΩ already on the rig works;
  so does the datasheet's 10kΩ. Leave pin 3 of the bare sensor unconnected.

Know what you're measuring before relying on it:

- **It can't go in the liquid.** A DHT11 isn't waterproof, so it reads air.
  To get a rough wort temperature, tape it flat against the fermenter wall
  and cover it with a pad of insulation. Liquid temperature lags and
  overshoots what it reports.
- **±2 °C, in roughly 1 °C steps, over 0–50 °C.** That's fine for proving
  the device → Supabase → dashboard pipeline. It's coarse for a ferment where
  18 °C and 22 °C taste different, so tighten or widen the thresholds to
  match.
- Each wake takes about a second longer. The sensor needs that long after
  power-up, and a bad read gets one retry 2 s later.
- The sketch prints humidity to the serial log but doesn't post it. The
  database has no column for it.

A failed read prints `Error: could not read DHT11 (check wiring/pull-up)`.
Check that DATA is on GPIO4 and the pull-up is fitted.

The Temp + Gravity sketch has no DHT11 option. That module is sealed and
floats, so a DHT11 inside it would only read the housing's still air.

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

Set `OTA_ENABLED = true` per sketch. Each device type checks its own
manifest at a fixed public URL roughly once a day
(`OTA_CHECK_EVERY_N_CYCLES`) and self-updates + reboots if the manifest's
version is newer than its own `FIRMWARE_VERSION`. That check
(`checkForOTAUpdate()`) is unchanged by anything below — it still fetches a
flat `{"version": N, "url": "..."}` JSON object from a fixed, unauthenticated
URL and hand-parses it by substring search, no server-side changes.

**Publishing a release:** sign in to the dashboard with an admin account and
go to `/admin/firmware` (a "Firmware" link appears in the devices page
header for admins). Export the compiled binary (Arduino IDE Sketch > Export
Compiled Binary), upload it under the matching device type with a version
number matching `FIRMWARE_VERSION` in the `.ino`, then hit Publish. That
writes the device type's `manifest.json` and the `vN.bin` object into the
project's `firmware` Storage bucket — the same two files this section used
to say to upload by hand into the Supabase Storage console, just tracked
with upload history and a one-click way to re-publish an older version as a
rollback. Hub and Temp + Gravity each read their own manifest
(`firmware/hub/manifest.json` / `firmware/tilt/manifest.json`), since they
ship different binaries — set `OTA_MANIFEST_URL` in each `.ino` to its
matching path.

Granting admin access (there's no UI for this — deliberately, it's a rare,
high-trust action): `insert into admin_users (user_id) select id from
auth.users where email = '...';` in the Supabase SQL editor.

`WiFiClientSecure::setInsecure()` is used for simplicity in v1 — pin the
actual CA certificate before shipping a large field batch, since
`setInsecure()` accepts any TLS certificate.

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

## Troubleshooting: the device never appears in the dashboard

A unit that has never posted leaves **no trace on the server** — there is
nothing to read at the Supabase end, so the diagnosis has to come off the
serial monitor. Connect at **115200 baud** and press EN/RST. Every failure
below prints a distinct line.

| Serial output | What it means | Fix |
|---|---|---|
| *(nothing at all)* | Not running, or wrong baud | Check 115200; on a DevKit V1 press EN. Bad USB cable (charge-only) is the usual culprit |
| `No WiFi credentials stored -- starting setup portal` | It's sitting in AP mode waiting to be configured | Join `FermentationMonitor-XXXXXX` and set WiFi, **or** fill in `WIFI_SSID`/`WIFI_PASSWORD` for bench work |
| `Temperature sensor: DS18B20 (1-Wire fallback)` | No MCP9808 — normal if you didn't fit one | None |
| `Error: could not read DS18B20` | Sensor not responding | **Missing 4.7k pull-up between GPIO4 and 3V3** — by far the most common cause. Then check the data lead is on GPIO4 and that it's 3V3, not 5V |
| `Temperature read FAILED -- no reading to post` | The cycle has no reading | As above. The device now still connects and posts a `sensor_fault` alert, so it shows up in the dashboard instead of vanishing |
| `WiFi connection failed` | Radio can't associate | ESP32 is **2.4 GHz only** — it cannot see a 5 GHz-only SSID. Check for a typo and for WPA3-only mode |
| `Reading POST failed, HTTP code: 401` | Server rejected the credentials | `DEVICE_ID` or `DEVICE_SECRET` doesn't match the row in `devices` |
| `Reading POST failed, HTTP code: -1` | TLS/connection failure | Check `SUPABASE_URL` has `https://` and no trailing slash |
| `Reading posted OK` | Working | If the dashboard still looks empty, confirm you're signed in as the account that owns the device |

### The failure that used to hide the device

A failed temperature read originally ended the cycle *before* WiFi, so a
disconnected sensor and a dead device looked identical — both silent. The
device now comes up and posts a `sensor_fault` alert (latched, re-announced
once a day), which shows in the dashboard as **"Sensor not reading"**.

### Checking whether the device ever reached the server

Supabase → Logs → API. Requests from the unit show a `ESP32HTTPClient`
user-agent hitting `/rest/v1/rpc/ingest_reading`. Only browser traffic means
the device never got that far, and the fault is on the device side.
