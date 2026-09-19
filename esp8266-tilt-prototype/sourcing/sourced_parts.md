# Sourced Parts — ESP8266 D1 Mini Bench Prototype

Module-level equivalent of `sourced_bom.md`. This is a one-off bench
build from on-hand/hobbyist parts, not a JLCPCB batch order — sourcing
here means "confirm what you have is the right thing," not tiered
stock/pricing verification.

## User-supplied modules

| Part | Status | Action needed |
|---|---|---|
| ESP8266 D1 Mini | ✅ Confirmed correct (photo) | None |
| TP4056 micro-USB charger, "HKD", 5V 1A, board "03962A" | ✅ Confirmed protected (3 ICs: TP4056 + DW01A + FS8205A) | None |
| GY-291 (ADXL345) breakout | ✅ Confirmed correct part, `SDO`/`CS` confirmed dedicated pins (photo) | None — both wired in the circuit |

## Still needed

| Part | Suggested source | Notes |
|---|---|---|
| MCP9808 I2C breakout | Adafruit #1782, or any clone breakout | Replaces the DS18B20 TO-92 probe — too bulky for a PCB-mounted build. Shares the GY-291's I2C bus. **Verify `A0`/`A1`/`A2` default grounded** (address `0x18`) on the specific board bought, see `architecture/design_risks.md` |
| 18650 Li-ion cell (~2500mAh) | Any | Matches the production board's cell sizing assumption |
| 18650 holder or solder tabs | Any | — |
| 10kΩ resistor ×1 | LCSC C25804 (0603 SMD) or any through-hole 1/4W | Battery-sense divider top (R1) — sized for this board's confirmed onboard A0 divider, see `net_plan.md` |
| 22kΩ resistor ×1 | LCSC C31850 (0603 SMD) or any through-hole 1/4W | Battery-sense divider bottom (R2) |
| Breadboard + jumper wires | Any | — |

## Explicitly not sourced (deliberate, see design_risks.md)

- Q1/Q2 gating transistors (AO3401A/MMBT3904) — ungated divider on this
  build, per the prototype doc's own guidance.
- DS18B20 TO-92 probe, 1-Wire pull-up resistor — superseded by the
  MCP9808 breakout above (no bulky TO-92 package, no extra GPIO).
- USB-C connector, TP4056 bare IC/DW01A/FS8205A discrete ICs — superseded
  by the user's TP4056 breakout module.
