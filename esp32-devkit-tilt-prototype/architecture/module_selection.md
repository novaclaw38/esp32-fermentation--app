# Module Selection — ESP32 Dev Kit V1 Bench Prototype

Module-level equivalent of `ic_selection.md` — whole breakout modules,
not bare ICs, so no JLCPCB tier selection for the three main modules
(not orderable as single JLCPCB line items). Passives (divider
resistors) verified live against JLCPCB per the usual sourcing rules.

## Block 2 — MCU

| Selection | Status | Notes |
|---|---|---|
| **ESP32 Dev Kit V1** (generic 30-pin ESP32-WROOM-32 breakout) | ⚠️ Not yet verified against a physical board/photo | Pin *layout* varies across manufacturers of nominally-identical "Dev Kit V1" boards even though the underlying GPIO *numbers* are fixed by the WROOM-32 module. Locate `GPIO4`/`21`/`22`/`25`/`34`/`3V3`/`VIN`/`GND` by their printed GPIO labels on your specific board, not by counting header position from a generic diagram — see `design_risks.md`. |

## Block 1 — Charger

| Selection | Status | Notes |
|---|---|---|
| **TP4056 micro-USB breakout** (user-supplied, reused from the ESP8266 rig if it's the same physical unit) | Carry over the ESP8266 rig's verification if it's literally the same board — otherwise re-count ICs: protected boards have three (TP4056 + DW01A + FS8205), unprotected have one. See `hardware/PROTOTYPE_TEMP_GRAVITY.md`. |

## Block 4 — Sensor Bus

| Selection | Status | Notes |
|---|---|---|
| **GY-291 (ADXL345) breakout** (user-supplied) | Carry over the ESP8266 rig's verification if it's the same physical board (confirmed `SDO`/`CS` dedicated pins, printed axis diagram) — otherwise re-verify per `design_risks.md`. |

## Block 5 — Temperature

| Selection | Status | Notes |
|---|---|---|
| **DHT11, Asair, bare 4-pin** (user-supplied) | ✅ Confirmed by photo | Replaces the MCP9808 as this build's temperature sensor. No onboard pull-up (unlike the common 3-pin blue-PCB breakout) — `R3` (10kΩ) added between `DATA` and `3V3` in the SKiDL circuit. See `datasheets/DHT11_SUMMARY.md`. |

## Passives (verified live against JLCPCB)

| Function | MPN | LCSC# | Notes |
|---|---|---|---|
| Battery divider top (R1) | 0603WAF1003T5E, 100kΩ | C25803 | Same part already sourced and verified for the production PCB's own R1/R2 (`../sourcing/sourced_bom.md`) — reused here since the ESP32's native 0-3.3V ADC needs the exact same 1:1 ratio, no ESP8266-style redesign required. |
| Battery divider bottom (R2) | 0603WAF1003T5E, 100kΩ | C25803 | Same MPN as R1 (1:1 ratio) |
| DHT11 pull-up (R3) | 0603WAF1002T5E, 10kΩ | C25804 | Same MPN already sourced and verified for the ESP8266 rig's original battery divider top (`../../esp8266-tilt-prototype/architecture/module_selection.md`) — reused here for a different purpose (DHT11 data pull-up), same value. |

These are SMD 0603 values given for BOM consistency with the rest of
the repo; for an actual breadboard build, any through-hole 1/4W
resistor of the same value works identically and is easier to plug in.
