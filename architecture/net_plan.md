# Net Plan — Temp + Gravity Module

| Net | Type | Connected parts |
|---|---|---|
| `VBUS` | Power, 5V | J1 (USB-C VBUS pins) → U2 (TP4056 VIN), C5 (10µF) |
| `CC1` | Signal | J1 CC1 → R11 (5.1kΩ 1%) → GND |
| `CC2` | Signal | J1 CC2 → R12 (5.1kΩ 1%) → GND |
| `BAT_RAW` | Power, 3.0–4.2V | 18650 cell (via J3) B+ → U3 (DW01A) → U4 (FS8205A) → `BAT+` |
| `BAT+` | Power, 3.0–4.2V (protected) | U4 output → U2 (TP4056 BAT pin, charge path), U5 (LDO IN), Q1 source, R6 top |
| `BAT-` / `GND` | Power, 0V | Common ground — TP4056, DW01A, FS8205, LDO, ESP32, ADXL345, MCP9808, all pull-downs |
| `PROG` | Signal | U2 PROG pin → R9 (1.2kΩ) → GND — sets ~1A charge current |
| `CHRG` | Signal, active-low | U2 CHRG pin → D1 (red LED) → R13 (2kΩ) → 3V3 |
| `STDBY` | Signal, active-low | U2 STDBY pin → D2 (green LED) → R14 (2kΩ) → 3V3 |
| `LDO_IN` | Power | = `BAT+` → C7 (1µF) → U5 IN |
| `3V3` | Power, regulated | U5 OUT → C8 (1µF) → ESP32 VDD pins, ADXL345 VCC, MCP9808 VDD, C2/C3 (0.1µF decouple), C4 (22µF bulk), R4 (EN pull-up), R5 (IO0 pull-up), R7 (SDA pull-up), R8 (SCL pull-up), CHRG/STDBY LED anodes via R13/R14, J4 pin 1, ADXL345 CS (I2C mode select) |
| `BATT_SENSE` | Signal, analog | Q1 drain → R1 (100kΩ) → node → R2 (100kΩ) → GND; node → C9 (0.1µF filter) → ESP32 GPIO34 (ADC1_6) |
| `DIV_EN` | Signal | ESP32 GPIO25 → R10 (10kΩ) → Q2 base |
| `Q1_GATE` | Signal | Q1 gate ← R6 (100kΩ, pull-up to `BAT+`, defines off-state) and ← Q2 collector |
| Q2 emitter | Power | Q2 emitter → GND |
| `SDA` | I2C | ESP32 GPIO21 → R7 (4.7kΩ pull-up to 3V3) → ADXL345 SDA, MCP9808 SDA |
| `SCL` | I2C | ESP32 GPIO22 → R8 (4.7kΩ pull-up to 3V3) → ADXL345 SCL, MCP9808 SCL |
| ADXL345 `SDO` | Signal | → GND (sets I2C address 0x53) |
| ADXL345 `CS` | Signal | → 3V3 (selects I2C mode) |
| MCP9808 `A0`/`A1`/`A2` | Signal | → GND (sets I2C address 0x18) |
| `ONE_WIRE` (optional) | Signal | ESP32 GPIO4 → R3 (4.7kΩ pull-up to 3V3) → DS18B20 DATA — **only populated if DS18B20 fitted instead of/alongside U7**; omit net and R3 otherwise |
| `EN` | Signal | ESP32 EN pin ← R4 (10kΩ pull-up to 3V3), C1 (1µF to GND) — boot RC delay |
| `IO0` | Signal | ESP32 IO0 pin ← R5 (10kΩ pull-up to 3V3), SW1 (tactile button to GND) |
| `TXD0` | UART | ESP32 GPIO1 (U0TXD) → J4 pin (programming header) |
| `RXD0` | UART | ESP32 GPIO3 (U0RXD) → J4 pin (programming header) |
| `J4_HEADER` | — | 6-pin 2.54mm: 3V3, GND, TXD0, RXD0, EN, IO0 |

## Notes for downstream agents

- **DS18B20 is conditional.** Default BOM populates U7 (MCP9808) and omits
  R3/DS18B20 entirely. Only include the `ONE_WIRE` net and R3 if the coder
  is asked to build the DS18B20-fallback variant.
- **`Q1_GATE` polarity is safety-critical** — see `design_risks.md`. Do not
  let the SKiDL coder simplify this to a direct GPIO→gate connection.
- GPIO4/21/22/25/34 pin assignments are fixed by `firmware/fermentation_tilt_v1/`
  — do not reassign without a corresponding firmware change.
