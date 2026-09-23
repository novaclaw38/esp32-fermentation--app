# DHT11 — Temperature + Humidity Breakout

Replaces the MCP9808 as this build's only temperature sensor. Unlike
the MCP9808↔DS18B20 swap on the sibling rigs (both I2C/1-Wire sensors
sharing firmware auto-detect logic), this is a genuinely different
sensor family — its own protocol, its own library, its own read
function in the firmware.

| Spec | Value |
|------|-------|
| Interface | Single-wire, proprietary timing protocol (not I2C, not Dallas 1-Wire — needs its own library, not `OneWire`/`DallasTemperature`) |
| Accuracy | ±2°C — notably worse than the MCP9808 it replaced (±0.5°C) |
| Resolution | Integer only — no fractional degrees, unlike the MCP9808's 0.0625°C steps |
| Range | 0-50°C, 20-80% RH |
| Vcc | 3-5.5V (fine off this board's 3V3 rail) |
| Sample rate | Max ~1 reading/second — irrelevant here (one read per wake cycle) |
| Also reports | Relative humidity (0-100% RH claimed, ±5% typical accuracy) |

## Two common physical variants — confirm which one you have

| Variant | Pins | Pull-up |
|---|---|---|
| **3-pin breakout** (blue PCB, most common for hobbyist use) | VCC, DATA, GND | **Onboard** — no external resistor needed. This is what the SKiDL circuit (`circuits/esp32_devkit_tilt_prototype/dht11.py`) models. |
| **Bare 4-pin sensor** (no PCB) | VCC, DATA, NC, GND | **External** — needs a 10kΩ resistor between `DATA` and `3V3`. Not modeled in the current SKiDL circuit; add `R3` yourself if this is what you have. |

## Pinout used here (3-pin breakout)

| Pin | Function here |
|-----|----------------|
| VCC | `DEVKIT_3V3` |
| DATA | `DHT_DATA` net → Dev Kit V1 `GPIO4` |
| GND | `GND` |

## Firmware

Uses Adafruit's **"DHT sensor library"** (plus its **"Adafruit Unified
Sensor"** dependency) — install both via Arduino IDE's Library Manager.
`readTemperature()` in `firmware/fermentation_tilt_v1_esp32_devkit/`
calls `dht.readTemperature()` and `dht.readHumidity()` together (the
sensor's protocol always returns both in one transaction). Humidity is
logged to serial but **not posted** to Supabase — the `readings` table
has no humidity column, so storing it for real would need a schema
migration and a dashboard change first.

## What changed vs. the MCP9808 it replaced

- **Lower accuracy** (±2°C vs ±0.5°C) and **coarser resolution**
  (integer-only vs 0.0625°C steps) — a real measurement-quality
  tradeoff, not just a wiring change.
- **Off the I2C bus entirely** — the GY-291 accelerometer keeps
  `GPIO21`/`22` to itself now; the DHT11 has its own dedicated `GPIO4`.
- **No automatic fallback.** The MCP9808/DS18B20 pairing on the
  sibling rigs auto-detects which sensor is present; this build has
  exactly one temperature sensor and no fallback path if it fails.
