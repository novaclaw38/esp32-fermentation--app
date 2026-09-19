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
| **DS18B20, bare TO-92** | Recommended, not yet sourced | LCSC C9753 (Maxim, genuine, ±0.5°C) or C376006 (UMW, ±0.4°C, cheaper) — either is fine for a bench probe. Not a JLCPCB SMT-line item at this quantity; buy individually from any distributor. |

## Passives (verified live against JLCPCB)

| Function | MPN | LCSC# | Stock | Tier | Notes |
|---|---|---|---|---|---|
| Battery divider top (R1) | 0603WAF3303T5E, 330kΩ | C23137 | 954,047 | Basic | New value — production board uses 100k here; ESP8266's 1.0V ADC range needs a steeper ratio, see `net_plan.md` |
| Battery divider bottom (R2) | 0603WAF1003T5E, 100kΩ | C25803 | 22,656,083 | Basic | Same part already verified for the production board in `../architecture/ic_selection.md` |
| 1-Wire pull-up (R3, if needed) | 0603WAF4701T5E, 4.7kΩ | C23162 | 24,680,139 | Basic | Only needed if the DS18B20 probe doesn't already carry one — check before adding a redundant one |

These are SMD 0603 values given for BOM consistency with the rest of the
repo; for an actual breadboard build, any through-hole 1/4W resistor of
the same value works identically and is easier to plug in.
