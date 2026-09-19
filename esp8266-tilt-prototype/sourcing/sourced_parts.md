# Sourced Parts — ESP8266 D1 Mini Bench Prototype

Module-level equivalent of `sourced_bom.md`. This is a one-off bench
build from on-hand/hobbyist parts, not a JLCPCB batch order — sourcing
here means "confirm what you have is the right thing," not tiered
stock/pricing verification.

## User-supplied modules

| Part | Status | Action needed |
|---|---|---|
| ESP8266 D1 Mini | ✅ Confirmed correct (photo) | None |
| TP4056 micro-USB charger, "HKD", 5V 1A | ⚠️ Protection unverified | Count ICs — 3 = protected (safe), 1 = not (get a protected one before the battery test) |
| GY-291 (ADXL345) breakout | ✅ Confirmed correct part | Verify `SDO` → GND before wiring I2C |

## Still needed

| Part | Suggested source | Notes |
|---|---|---|
| DS18B20, bare TO-92 | LCSC C9753 (Maxim, ±0.5°C) or any distributor | Bench probe — not the production board's MCP9808 |
| 18650 Li-ion cell (~2500mAh) | Any | Matches the production board's cell sizing assumption |
| 18650 holder or solder tabs | Any | — |
| 330kΩ resistor ×1 | LCSC C23137 (0603 SMD) or any through-hole 1/4W | Battery-sense divider top — **not** the production board's 100k, see `net_plan.md` |
| 100kΩ resistor ×1 | LCSC C25803 (0603 SMD) or any through-hole 1/4W | Battery-sense divider bottom |
| 4.7kΩ resistor ×1 | LCSC C23162 (0603 SMD) or any through-hole 1/4W | 1-Wire pull-up — only if the DS18B20 probe doesn't already have one |
| Breadboard + jumper wires | Any | — |
| Short wire for D0→RST jumper | Any | Only if the board doesn't already bridge this — check first |

## Explicitly not sourced (deliberate, see design_risks.md)

- Q1/Q2 gating transistors (AO3401A/MMBT3904) — ungated divider on this
  build, per the prototype doc's own guidance.
- MCP9808 — production-board-only part.
- USB-C connector, TP4056 bare IC/DW01A/FS8205A discrete ICs — superseded
  by the user's TP4056 breakout module.
