# Sourced Parts — ESP32 Dev Kit V1 Bench Prototype

Module-level equivalent of `sourced_bom.md`. One-off bench build from
on-hand/hobbyist parts, not a JLCPCB batch order.

## User-supplied modules (status carried over from the ESP8266 rig if reusing the same physical parts)

| Part | Status | Action needed |
|---|---|---|
| ESP32 Dev Kit V1 (30-pin, WROOM-32) | ⚠️ Not yet verified against a photo | Confirm GPIO4/21/22/25/34/3V3/VIN/GND are present and locate them by label — see `architecture/design_risks.md` |
| TP4056 micro-USB charger breakout | Carry over ESP8266 rig's verification if same physical board, else re-verify | Count ICs (3 = protected, 1 = unprotected) |
| GY-291 (ADXL345) breakout | Carry over ESP8266 rig's verification if same physical board, else re-verify | Confirm `SDO`/`CS` are dedicated pins |
| DHT11 breakout | ⚠️ Not yet verified against a photo | Confirm 3-pin (onboard pull-up) vs. bare 4-pin (needs external 10kΩ pull-up) variant — see `datasheets/DHT11_SUMMARY.md` |

## Still needed

| Part | Suggested source | Notes |
|---|---|---|
| 18650 Li-ion cell (~2500mAh) | Any | Matches the production board's cell sizing assumption |
| 18650 holder or solder tabs | Any | — |
| 100kΩ resistor ×2 | LCSC C25803 (0603 SMD) or any through-hole 1/4W | Battery-sense divider (R1, R2) — same MPN already sourced/verified for the production board's own divider, see `architecture/module_selection.md` |
| Breadboard + jumper wires | Any | — |

## Explicitly not sourced (deliberate, see design_risks.md)

- Q1/Q2 gating transistors (AO3401A/MMBT3904) — ungated divider on this
  build, per the prototype doc's own guidance.
- MCP9808 I2C breakout, DS18B20 TO-92 probe + pull-up resistor — DHT11
  is this build's only temperature sensor.
- USB-C connector, TP4056 bare IC/DW01A/FS8205A discrete ICs — superseded
  by the user's TP4056 breakout module.

## sourcing_status: partial

The MCU board itself and all three main breakouts are user-supplied and
unverified pending a photo (same pattern the ESP8266 rig went through —
each item got resolved against the actual hardware as photos came in).
Only the two 100kΩ divider resistors are a real "go buy this" sourcing
item, and that part is already verified in-stock for the production
board (`../../sourcing/sourced_bom.md`).
