# Module Selection — ESP8266 D1 Mini Bench Prototype

Module-level equivalent of `ic_selection.md` — this build integrates
whole breakout modules, not bare ICs, so there's no JLCPCB tier
selection to do for the three main modules (they're not orderable as
single JLCPCB line items). Passives (divider resistors, pull-up) are
verified live against JLCPCB per the usual sourcing rules, since they're
ordinary components you'd buy regardless of module choice.

## Block 2 — MCU

| Selection | Status | Notes |
|---|---|---|
| **ESP8266 D1 Mini** (user-supplied) | ✅ Confirmed by photo | Genuine Wemos-pinout clone, 4MB flash, ESP-12F module. This is the board being ported *to* — see `SPEC.md` for why it's not interchangeable with the ESP32 D1 Mini the production firmware assumes. |

## Block 1 — Charger

| Selection | Status | Notes |
|---|---|---|
| **TP4056 micro-USB breakout, "HKD", 5V 1A, board marking "03962A"** (user-supplied) | ✅ **Confirmed protected** | Per `hardware/PROTOTYPE_TEMP_GRAVITY.md`: "Count the ICs to tell them apart: protected boards have three (TP4056 + DW01A + FS8205), unprotected have one." User photo shows three ICs — one SOP-8 (TP4056) plus two SOT-23-6 (DW01A + FS8205A). Cleared for the battery/float test. |

## Block 4 — Sensor Bus

| Selection | Status | Notes |
|---|---|---|
| **GY-291 (ADXL345) breakout** (user-supplied) | ✅ Confirmed — exactly the part the prototype doc recommends | Known gotcha: verify `SDO` is tied to GND on this specific clone (many aren't) before trusting I2C address 0x53 — see `architecture/design_risks.md`. |
| **MCP9808 I2C breakout** (e.g. Adafruit #1782 or clone) | Recommended, not yet sourced | Swapped in for the DS18B20 TO-92 probe — too bulky for a PCB-mounted build. Shares the GY-291's I2C bus, no extra wiring. Verify the breakout's `A0`/`A1`/`A2` address pins default grounded (address `0x18`) before assuming it — see `architecture/design_risks.md`. |

## Passives (verified live against JLCPCB)

| Function | MPN | LCSC# | Stock | Tier | Notes |
|---|---|---|---|---|---|
| Battery divider top (R1) | 0603WAF1002T5E, 10kΩ | C25804 | 22,373,597 | Basic | Value changed after confirming this D1 Mini clone has its own onboard divider (~220k/100k) — this external divider now targets the board's ~3.2V header ceiling, not the chip's 1.0V limit directly. Same part already verified for the production board in `../architecture/ic_selection.md`. See `net_plan.md` for the two-stage derivation |
| Battery divider bottom (R2) | 0603WAF2202T5E, 22kΩ | C31850 | 3,823,319 | Basic | Paired with R1 above for the two-stage divider |

These are SMD 0603 values given for BOM consistency with the rest of the
repo; for an actual breadboard build, any through-hole 1/4W resistor of
the same value works identically and is easier to plug in.
