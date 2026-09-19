# SPEC.md — ESP8266 D1 Mini Bench Prototype (Temp + Gravity)

A breadboard-buildable variant of the Temp + Gravity floating module,
using the user's on-hand ESP8266 D1 Mini plus two off-the-shelf breakout
modules, instead of the production custom PCB
(`hardware/PCB_DESIGN.md` / `../circuits/temp_gravity_module/`). This is
a **separate hardware target**, ported from
`firmware/fermentation_tilt_v1/fermentation_tilt_v1.ino` — see
`architecture/design_risks.md` for the full list of why an ESP8266 isn't
a drop-in swap for the ESP32 design.

## User-supplied hardware (confirmed by photo)

- **ESP8266 D1 Mini** — genuine Wemos-pinout clone. Silkscreen confirms:
  `3V3 D8 D7 D6 D5 D0 A0 RST` on one side, `5V GND D4 D3 D2 D1 RX TX` on
  the other, micro-USB (flashing power only), reset button, "4MB" flash.
  This is the ESP8266 (ESP-12F module, visible zigzag PCB antenna trace)
  — **not** the ESP32 D1 Mini the production firmware assumes.
- **TP4056 Li-ion charger breakout, micro-USB, 5V 1A** ("HKD"-branded or
  similar generic module, board marking "03962A"). ✅ **Confirmed
  protected** — user photo shows three ICs: one SOP-8 (TP4056) plus two
  SOT-23-6 (DW01A + FS8205A) — matching the protected-board signature in
  `architecture/design_risks.md` finding #1. Safe to wire to a cell.
- **GY-291 breakout (ADXL345)** — exactly the part
  `hardware/PROTOTYPE_TEMP_GRAVITY.md` already recommends for this bench
  build.

## Functional

- Same behavior as `fermentation_tilt_v1.ino`: wake from deep sleep,
  read temperature (DS18B20 probe on this bench rig; MCP9808 is a
  production-board-only part, not used here) + tilt angle (ADXL345),
  connect WiFi, fetch remote config, POST a reading via the
  `ingest_reading` RPC, check thresholds, sleep.
- **No gravity computed on-device** — raw tilt angle posted, calibration
  curve applied server-side, unchanged from the production design.
- Bench-only: this is for the axis-test and gravity-sweep calibration
  steps in `hardware/PROTOTYPE_TEMP_GRAVITY.md` §1-2, not a sealed
  field unit.

## Power

- 18650 cell → TP4056 breakout `B+`/`B-` → breakout `OUT+`/`OUT-` → D1
  Mini `5V` pin. The D1 Mini's onboard regulator (ME6211-class on
  genuine Wemos boards, ~0.1-0.3V dropout) runs fine down to a
  ~3.4-3.6V cell — **no separate LDO needed**, unlike a DevKit V1.
- **Battery-sense divider is ungated** (no Q1/Q2 PMOS/NPN pair), per
  `hardware/PROTOTYPE_TEMP_GRAVITY.md`'s own explicit guidance for
  breadboard builds: "a permanent divider draws ~21µA, which is
  irrelevant beside this board's own sleep current." The firmware still
  toggles `BATTERY_EN_PIN` and waits before reading, matching the
  production sketch's structure, but the pin drives nothing on this
  build.
- **Divider is TWO stages on this board, not one.** ESP8266's chip-level
  ADC has a 10-bit, **0-1.0V** input range (not ESP32's 0-3.3V), and —
  confirmed by the user — this specific D1 Mini clone has its own
  onboard divider (~220kΩ/100kΩ) between the `A0` header pin and the
  chip, stepping 0-3.2V down to 0-1.0V. The external divider only needs
  to bring the cell voltage down to that ~3.2V header ceiling — see
  Interface section for the combined ratio.

## Interface

- I2C: `D1` (GPIO5) = SCL, `D2` (GPIO4) = SDA — the conventional I2C
  pins on a Wemos D1 Mini, matching what most D1 Mini shields assume.
- DS18B20 (bench probe): `D6` (GPIO12) data, 4.7kΩ pull-up to 3V3 (only
  if the probe doesn't already carry one).
- Battery sense: `A0`, through an external 10kΩ/22kΩ divider from `BAT+`
  (not gated), feeding into the board's own onboard ~220kΩ/100kΩ
  divider — see `architecture/net_plan.md` for the two-stage math.
- **`D0` (GPIO16) MUST be wired to `RST`** for `ESP.deepSleep()` to ever
  wake the board — ESP8266 deep-sleep wake works *only* by GPIO16
  pulsing low into RST. ✅ **Done** — the board's "SLEEP" solder-jumper
  pad next to `D0` has been bridged. Recommended: confirm continuity
  between `D0` and `RST` with a multimeter before the first real
  deep-sleep cycle.
- Unused/avoided: `D3` (GPIO0), `D4` (GPIO2), `D8` (GPIO15) — ESP8266
  boot-strapping pins, left unconnected on this build.

## Physical

- Breadboard or D1 Mini proto shield, no housing — bench calibration rig
  only (axis test + gravity-sweep), per
  `hardware/PROTOTYPE_TEMP_GRAVITY.md`.

## Production

- N/A — this is a one-off bench prototype, not a batch build. No JLCPCB
  sourcing; parts are the user's on-hand modules plus generic
  breadboard passives (see `sourcing/sourced_parts.md`).
