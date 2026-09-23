# SPEC — ESP32 Dev Kit V1 Bench Prototype

## Context

Sibling project to [`../esp8266-tilt-prototype/`](../esp8266-tilt-prototype/)
— same bench-testing goal (temp + gravity module, off-PCB, breakout
modules on a breadboard), same ungated battery divider philosophy, same
TP4056 charger and GY-291/ADXL345. Two things change from the ESP8266
sibling: the MCU is a generic **ESP32 Dev Kit V1** (WROOM-32 module on a
30-pin breakout board) instead of an ESP8266 D1 Mini, and the
temperature sensor is a **DHT11** (single-wire, `GPIO4`) instead of an
MCP9808/DS18B20 pairing — see `datasheets/DHT11_SUMMARY.md`.

Unlike the ESP8266 port, this does **not** need firmware rewritten from
scratch: the production board's own firmware
([`../firmware/fermentation_tilt_v1/`](../firmware/fermentation_tilt_v1/))
already targets a bare ESP32 (raw GPIO numbers, `RTC_DATA_ATTR`,
`Preferences`, single-arg `HTTPClient::begin()`, no deep-sleep
microsecond wraparound) — a Dev Kit V1 is the same chip with those same
GPIOs broken out directly. The only real difference from the production
firmware is the **battery divider is ungated** here (no Q1/Q2 switching
transistors), same reasoning as the ESP8266 bench rig.

## Why a separate project folder

Same reasoning as the ESP8266 sibling: a full SKiDL pipeline (ERC-passing
wiring diagram, sourced BOM, datasheets, schematic PDF) belongs in its
own self-contained folder rather than mixed into the production
`circuits/temp_gravity_module/` package, which models the actual PCB
layout (gated divider, potted DS18B20, bare ESP32-WROOM-32E) — a
different physical artifact from this breadboard rig.

## Functional

- Same behavior as `fermentation_tilt_v1.ino`: wake from deep sleep, read
  temperature (DHT11, single-wire — also reports humidity, posted
  alongside temperature) + tilt angle (ADXL345 via the GY-291 breakout),
  connect WiFi, fetch remote config, POST a reading via the
  `ingest_reading` RPC, check thresholds, sleep.
- **No gravity computed on-device** — raw tilt angle posted, calibration
  curve applied server-side, unchanged from the production design.
- Bench-only: for the axis-test and gravity-sweep calibration steps in
  `hardware/PROTOTYPE_TEMP_GRAVITY.md`, not a sealed field unit.

## Power

- 18650 cell → TP4056 breakout `B+`/`B-` → breakout `OUT+`/`OUT-` → Dev
  Kit V1's `VIN` pin. The board's onboard regulator (typically an
  AMS1117-3.3 on most 30-pin clones) runs fine from a Li-ion cell's
  3.0-4.2V range — **no separate LDO needed**.
- **Battery-sense divider is ungated** (no Q1/Q2 PMOS/NPN pair), same
  rationale as the ESP8266 rig and the prototype doc's own explicit
  guidance for breadboard builds: a permanent divider's leakage current
  is irrelevant beside deep-sleep current on a bench setup. The
  firmware still toggles `BATTERY_EN_PIN` for structural parity with
  the production sketch, but the pin drives nothing physical here.
- **Divider is a single stage, unlike the ESP8266 rig.** The ESP32's
  ADC accepts **0-3.3V natively** (12-bit) — no onboard pre-divider
  quirk to work around like the ESP8266 D1 Mini clone had. A 100kΩ/100kΩ
  1:1 divider (the same value already used on the production PCB) brings
  a 4.2V max cell down to 2.1V, comfortably inside the ADC's range with
  headroom. Firmware multiplier is a plain `x2`.

## Interface

- I2C: `GPIO21` = SDA, `GPIO22` = SCL — matches the production board's
  own pin choice, so the same firmware constants apply unchanged. Only
  the GY-291 is on this bus now (MCP9808 removed).
- DHT11 on `GPIO4` (previously the unused DS18B20 fallback pin) — the
  common 3-pin breakout has an onboard pull-up; a bare 4-pin sensor
  needs an external 10kΩ pull-up to 3V3 that this design doesn't add.
- Battery sense: `GPIO34` (ADC1_CH6, input-only), through the external
  100kΩ/100kΩ divider from `BAT+` (not gated).
- `BATTERY_EN_PIN` = `GPIO25` — toggled for structural/behavioral parity
  with the production sketch (and the ESP8266 bench sketch), drives
  nothing physical on this ungated build.

## Explicitly out of scope

- Q1/Q2 gating transistors — ungated divider, per the prototype doc's
  own guidance for breadboard builds.
- A physical mounting/build guide (unlike the ESP8266 rig's Prototype
  Shield guide) — a Dev Kit V1 is a full-size board typically used
  directly on a breadboard; add one later if requested.
- Housing, potting, or any sealed-unit concerns — bench testing only.

## Hardware verification status

Unverified — no physical photos of this specific Dev Kit V1 board have
been provided yet. Flagged in `architecture/design_risks.md`:
specifically, **ESP32 Dev Kit V1 pin *layout* varies by manufacturer**
even though the GPIO *numbers* used here (4, 21, 22, 25, 34) are fixed
by the WROOM-32 module itself — locate these by GPIO number on your
specific board's silkscreen, not by counting header position.
