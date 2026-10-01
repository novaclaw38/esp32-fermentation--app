# Net Plan — ESP32 Dev Kit V1 Bench Prototype

| Net | Type | Connected parts |
|---|---|---|
| `VBUS_5V` | Power, 5V | Micro-USB J1 → TP4056 breakout VIN |
| `BAT_PLUS` | Power, 3.0-4.2V | TP4056 breakout `B+` → 18650 cell `+`; TP4056 breakout `OUT+` → Dev Kit V1 `VIN`; also → R1 (battery-sense divider top, 100kΩ) |
| `BAT_MINUS`/`GND` | Power, 0V | Common ground — TP4056 breakout `B-`/`OUT-`, 18650 `-`, Dev Kit V1 `GND`, GY-291 `GND`, DHT11 `GND`, R2 bottom |
| `DEVKIT_5V` | Power | = TP4056 `OUT+` (same node as BAT_PLUS — the board's onboard regulator runs from this) |
| `DEVKIT_3V3` | Power, regulated | Dev Kit V1 `3V3` pin (output of its onboard regulator) → GY-291 `VCC`, GY-291 `CS`, DHT11 `VDD`, R3 (DHT11 pull-up top, 10kΩ) |
| `SDA` | I2C | Dev Kit V1 `GPIO23` → GY-291 `SDA` (moved from `GPIO21`, whose pad is damaged on this board) |
| `SCL` | I2C | Dev Kit V1 `GPIO19` → GY-291 `SCL` (moved from `GPIO22`, whose pad is damaged on this board) |
| `SDO` | Signal | GY-291 `SDO` → `GND` — required for I2C address 0x53. Same gotcha as the ESP8266 rig: verify this is a dedicated pin on your specific GY-291 board before trusting it (not all clones expose it separately). |
| `CS` | Signal | GY-291 `CS` → `3V3` — forces I2C mode, avoids a floating CMOS input. Same verification caveat as `SDO`. |
| `DHT_DATA` | Signal, single-wire | Dev Kit V1 `GPIO4` → DHT11 `DATA`, pulled up to `3V3` through R3 (10kΩ) |
| `BATT_SENSE_ADC` | Signal, analog | R1 (100kΩ) from `BAT_PLUS` → node → R2 (100kΩ) → `GND`; node → Dev Kit V1 `GPIO34` (ADC1_CH6, input-only) |

## Temperature sensor — DHT11

Swapped in for the MCP9808 (previously shared the GY-291's I2C bus) —
the DHT11 sits on its own single-wire pin (`GPIO4`) instead, not I2C.
Not a wiring-only swap like MCP9808↔DS18B20 was on the sibling rigs
(those share firmware auto-detect logic and both sit on a bus/pin the
other already used) — the DHT11 is a genuinely different sensor family
with its own library and read function. See
`datasheets/DHT11_SUMMARY.md`. **Confirmed by photo**: this is the bare
4-pin Asair DHT11 (no onboard pull-up, unlike the common 3-pin
blue-PCB breakout) — R3 (10kΩ) adds the external pull-up this variant
needs between `DHT_DATA` and `3V3`.

DHT11 also reports humidity, posted alongside temperature via
`ingest_reading`'s `p_humidity_pct` parameter and stored in
`readings.humidity_pct` (`supabase/migrations/20260923120000_dht11_humidity.sql`)
— null for every other device type on this project.

## Deliberately NOT populated (vs. the production board)

- **No Q1/Q2 gating transistors** on the battery divider — ungated, per
  `hardware/PROTOTYPE_TEMP_GRAVITY.md`'s explicit guidance for
  breadboard builds. `BATTERY_EN_PIN` (`GPIO25`) is still toggled by
  firmware for structural parity with the production sketch, but is
  left unconnected on this build (`NC`).
- **No MCP9808 or DS18B20** — DHT11 is this build's only temperature
  sensor, wired on its own pin rather than sharing the I2C bus or
  falling back through firmware auto-detect.
- **No potted sensor against a housing wall** — this is a bare bench
  rig, not a sealed unit. The DHT11 sits loose.

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
