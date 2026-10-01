# DHT11 — Temperature + Humidity Sensor (Asair, bare 4-pin)

Replaces the MCP9808 as this build's only temperature sensor. Unlike
the MCP9808↔DS18B20 swap on the sibling rigs (both I2C/1-Wire sensors
sharing firmware auto-detect logic), this is a genuinely different
sensor family — its own protocol, its own library, its own read
function in the firmware.

**Confirmed by photo**: an Asair-branded bare 4-pin DHT11 (no PCB),
printed spec block reads `OC: 3.3-5.5V`, `U1: 5-95%RH`, `U2: -20-60°C`,
`U3: ±5%RH ±2°C`.

| Spec | Value |
|------|-------|
| Interface | Single-wire, proprietary timing protocol (not I2C, not Dallas 1-Wire — needs its own library, not `OneWire`/`DallasTemperature`) |
| Accuracy | ±2°C / ±5%RH — notably worse than the MCP9808 it replaced (±0.5°C) |
| Resolution | Integer only — no fractional degrees, unlike the MCP9808's 0.0625°C steps |
| Range | -20 to 60°C, 5-95% RH (per this unit's printed spec — some datasheets list 0-50°C/20-80%RH for DHT11 generally; trust the part in hand) |
| Vcc | 3.3-5.5V (fine off this board's 3V3 rail) |
| Sample rate | Max ~1 reading/second — irrelevant here (one read per wake cycle) |

## Physical variant — confirmed bare 4-pin, needs an external pull-up

This is the **bare 4-pin sensor** (no PCB, no onboard pull-up) — pins
`VDD` / `DATA` / `NC` / `GND` left to right, per the datasheet's
standard silkscreen order. Unlike the common 3-pin blue-PCB breakout
(which carries its own pull-up), this variant needs an **external 10kΩ
resistor between `DATA` and `3V3`** — modeled as `R3` in
`circuits/esp32_devkit_tilt_prototype/dht11.py`.

## Pinout used here

| Pin | Function here |
|-----|----------------|
| VDD | `DEVKIT_3V3` |
| DATA | `DHT_DATA` net → Dev Kit V1 `GPIO4`, pulled up to `3V3` through `R3` (10kΩ) |
| NC | Not connected — some datasheets list this as a factory-test pin, not user-connectable |
| GND | `GND` |

## Firmware

Uses Adafruit's **"DHT sensor library"** (plus its **"Adafruit Unified
Sensor"** dependency) — install both via Arduino IDE's Library Manager.
`readTemperature()` in `firmware/fermentation_tilt_v1_esp32_devkit/`
calls `dht.readTemperature()` and `dht.readHumidity()` together (the
sensor's protocol always returns both in one transaction). Humidity is
posted alongside temperature via `ingest_reading`'s `p_humidity_pct`
parameter, stored in `readings.humidity_pct` — added specifically for
this sensor in `supabase/migrations/20260923120000_dht11_humidity.sql`;
null for every other device type on this project (all temperature-only
sensors).

## What changed vs. the MCP9808 it replaced

- **Lower accuracy** (±2°C vs ±0.5°C) and **coarser resolution**
  (integer-only vs 0.0625°C steps) — a real measurement-quality
  tradeoff, not just a wiring change.
- **Off the I2C bus entirely** — the GY-291 accelerometer keeps
  `GPIO23`/`19` to itself now; the DHT11 has its own dedicated `GPIO4`.
- **No automatic fallback.** The MCP9808/DS18B20 pairing on the
  sibling rigs auto-detects which sensor is present; this build has
  exactly one temperature sensor and no fallback path if it fails.
