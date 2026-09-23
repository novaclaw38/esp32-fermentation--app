# Net Plan — ESP32 Dev Kit V1 Bench Prototype

| Net | Type | Connected parts |
|---|---|---|
| `VBUS_5V` | Power, 5V | Micro-USB J1 → TP4056 breakout VIN |
| `BAT_PLUS` | Power, 3.0-4.2V | TP4056 breakout `B+` → 18650 cell `+`; TP4056 breakout `OUT+` → Dev Kit V1 `VIN`; also → R1 (battery-sense divider top, 100kΩ) |
| `BAT_MINUS`/`GND` | Power, 0V | Common ground — TP4056 breakout `B-`/`OUT-`, 18650 `-`, Dev Kit V1 `GND`, GY-291 `GND`, MCP9808 `GND`, R2 bottom |
| `DEVKIT_5V` | Power | = TP4056 `OUT+` (same node as BAT_PLUS — the board's onboard regulator runs from this) |
| `DEVKIT_3V3` | Power, regulated | Dev Kit V1 `3V3` pin (output of its onboard regulator) → GY-291 `VCC`, GY-291 `CS`, MCP9808 `VDD` |
| `SDA` | I2C | Dev Kit V1 `GPIO21` → GY-291 `SDA`, MCP9808 `SDA` |
| `SCL` | I2C | Dev Kit V1 `GPIO22` → GY-291 `SCL`, MCP9808 `SCL` |
| `SDO` | Signal | GY-291 `SDO` → `GND` — required for I2C address 0x53. Same gotcha as the ESP8266 rig: verify this is a dedicated pin on your specific GY-291 board before trusting it (not all clones expose it separately). |
| `CS` | Signal | GY-291 `CS` → `3V3` — forces I2C mode, avoids a floating CMOS input. Same verification caveat as `SDO`. |
| `BATT_SENSE_ADC` | Signal, analog | R1 (100kΩ) from `BAT_PLUS` → node → R2 (100kΩ) → `GND`; node → Dev Kit V1 `GPIO34` (ADC1_CH6, input-only) |

## Temperature sensor — MCP9808 preferred, DS18B20 fallback

Same auto-detect firmware pattern as both the production board and the
ESP8266 bench rig: `mcp9808Begin()` runs first in `setup()`, and the
DS18B20 path (`GPIO4`, 1-Wire) only runs if no MCP9808 answers at I2C
address `0x18`. The MCP9808 shares `SDA`/`SCL` with the GY-291 — no
extra GPIO, no extra pull-up. If you wire a DS18B20 instead/as well, it
needs its own 4.7kΩ pull-up between `GPIO4` and `3V3` unless the probe
already carries one.

## Deliberately NOT populated (vs. the production board)

- **No Q1/Q2 gating transistors** on the battery divider — ungated, per
  `hardware/PROTOTYPE_TEMP_GRAVITY.md`'s explicit guidance for
  breadboard builds. `BATTERY_EN_PIN` (`GPIO25`) is still toggled by
  firmware for structural parity with the production sketch, but is
  left unconnected on this build (`NC`).
- **No potted DS18B20 against a housing wall** — this is a bare bench
  rig, not a sealed unit. Whichever temp sensor is fitted sits loose.

## Divider ratio — single stage, unlike the ESP8266 rig

The ESP32's ADC accepts **0-3.3V natively** (12-bit resolution), unlike
the ESP8266's 10-bit/0-1.0V-only `A0` pin (which additionally turned out
to have its own onboard pre-divider on the D1 Mini clone used in the
sibling project — see `../esp8266-tilt-prototype/architecture/net_plan.md`
for that whole saga). None of that complexity applies here: a plain
single-stage 100kΩ/100kΩ divider — the exact same value and part already
sourced and verified for the production PCB's R1/R2 — brings the cell
voltage comfortably within range:

```
adc_V = BAT_PLUS × R2/(R1+R2) = BAT_PLUS × 0.5
```

At a 4.2V max cell: `adc_V = 2.1V`, well inside the ADC's 0-3.3V range
with headroom to spare, and using a good fraction of the 12-bit range
for reasonable resolution. Firmware multiplier is a plain `x2`.

**Recommended even so:** the ESP32's ADC is well-documented as
nonlinear near its rails — calibrate an early reading against a
multimeter rather than trusting the raw `x2` conversion as a precision
fuel gauge, same caveat the production firmware's own comment makes.
