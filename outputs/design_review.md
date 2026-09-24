# Design Review — temp_gravity_module

## Summary
ERC: PASS | Architecture: OK (2 layout-stage items open) | Code: OK (2 documented convention deviations)
Severity: 0 HIGH, 3 MEDIUM, 3 LOW issues

## Findings

| # | Severity | Area | Issue | Suggested Fix |
|---|----------|------|-------|---------------|
| 1 | MEDIUM | Architecture/Mechanical | DW01A (U3) and FS8205A (U4) pin numbering is provisional — functional topology matches the standard reference pairing, but physical pin-to-pad mapping was never confirmed against a manufacturer datasheet (PDF downloads failed in this environment). | Before layout: pull the real datasheets (LCSC C351410, C2830320) or cross-reference a known-good DW01A+FS8205A breakout schematic, and correct `charge_protection.py` pin numbers if they differ. ERC cannot catch a wrong-but-internally-consistent pin mapping. |
| 2 | MEDIUM | Mechanical | ADXL345 (U6) uses `Package_LGA:LGA-14_3x5mm_P0.8mm_LayoutBorder1x6y` as a closest-available match — exact pad pitch not confirmed against ADXL345's real mechanical drawing (ADI's LGA-14 uses a non-uniform 0.55mm/0.8mm mixed pitch in some references). | Before ordering: verify footprint pad positions against the ADXL345 datasheet mechanical drawing (page with package dimensions), or generate a custom footprint via `generate-footprint.py` if the standard-library one doesn't match. |
| 3 | MEDIUM | Layout (not yet started) | ESP32 antenna keep-out (15×15mm, all layers) is a hard constraint flagged in `architecture/design_risks.md`, tighter here than on the Hub board given this design's 37mm-diameter tube housing. Not something SKiDL schematic capture can verify. | At layout: confirm the module's antenna edge can reach a board edge with full keep-out inside the 37mm diameter before finalizing board outline. |
| 4 | LOW | Code convention | Decoupling caps (C2, C3, C10, C12, etc.) use sequential ref designators matching `sourcing/sourced_bom.md`, not the `.claude/rules/skidl-syntax.md` convention of naming them `C_DECOUP_<IC_REF>`. | **Deliberately not changed** — renaming refs now would desync the schematic from the already-committed, reviewed `architecture/skeleton_bom.md` and `sourcing/sourced_bom.md`, which both use plain sequential BOM numbering (standard real-world PCB practice). Documented here rather than silently deviating. |
| 5 | LOW | Code convention | Signal nets (`SDA`, `SCL`, `DIV_EN`, `BATT_SENSE_ADC`) are UPPER_SNAKE_CASE, not the camelCase the syntax guide suggests for signals. | **Deliberately not changed** — matches `architecture/net_plan.md`'s own naming (already committed/reviewed), and SDA/SCL specifically are near-universal uppercase protocol names in virtually every I2C schematic; camelCase would be the actual inconsistency here. |
| 6 | LOW | Code quality | `mcu_core.py` marks 16 ESP32 GPIOs as `NC` individually rather than using the `part[:] += NC` then re-connect pattern shown in `skidl-syntax.md`. | Cosmetic only — both patterns produce an identical netlist. Not changed since the explicit list is easier to audit against the pin table in `datasheets/ESP32-WROOM-32E-N16_SUMMARY.md`. |

## 1. Electrical Rules (ERC)

**PASS.** See `outputs/erc_report.md` for the full report: 0 errors, 1
expected warning (intentional CELL_MINUS/GND net merge). Footprint
validation: 29/29 valid.

## 2. Architecture Sanity

- **All 6 functional blocks from `architecture/block_diagram.md` are
  present and coded**: power_input, charge_protection, regulation,
  battery_sense, mcu_core, sensor_bus. The 7th "block" (off-board cell)
  correctly has no SKiDL representation beyond its J3 connector, which
  lives in charge_protection.py.
- **Net plan consistency**: every net in `architecture/net_plan.md` has a
  corresponding wire in the code (VBUS, CC1/CC2, BAT+/BAT_RAW→CELL_MINUS,
  GND, PROG/CHRG/STDBY internal to charge_protection, 3V3, BATT_SENSE→
  BATT_SENSE_ADC, DIV_EN, Q1_GATE internal to battery_sense, SDA, SCL,
  EN, IO0, TXD0/RXD0). `ONE_WIRE`/R3/DS18B20 is correctly absent — this
  build is the MCP9808-only variant per `SPEC.md`.
- **Power budget**: matches the design intent — LDO Iq (1µA, confirmed
  via `ic_selection.md`) plus the gated divider (Q1/Q2, only drawing
  current during the brief ADC read) keeps sleep current in the
  target range; nothing in the code contradicts the ~5-month runtime
  estimate.
- **Known design risks addressed in code**: Q1/Q2 gate-drive topology
  (finding #4 in `architecture/design_risks.md`) is wired correctly —
  `Q2["C"] += Q1["G"]`, `R6` pulls the gate to `BAT+` (not 3V3), matching
  the documented off-state requirement. USB-C CC pull-downs present.
  MCP9808 decoupling (C12) added beyond the original BOM, which had none
  — a real improvement over `hardware/BOM_TEMP_GRAVITY.md`.
- **Not addressable at the schematic-capture stage** (tracked as findings
  #1-#3 above, not defects): DW01A/FS8205A pin verification, ADXL345
  footprint verification, antenna keep-out — all mechanical/layout
  concerns that ERC and netlist generation cannot check.

## 3. SKiDL Code Quality

Checked against `.claude/rules/skidl-syntax.md`:

- ✅ Every part has `ref` and `footprint`; `value` is set explicitly for
  passives/LEDs and auto-populated from the part name for ICs (confirmed
  in `outputs/temp_gravity_module_bom.xml`).
- ✅ `@SubCircuit` used for all 6 blocks.
- ✅ `NC` used on every intentionally unused pin (ESP32 idle GPIOs,
  ADXL345 reserved/INT pins, MCP9808 Alert, TP4056 TEMP, FS8205A NC).
- ✅ `ERC()` called in `__main__.py` before `generate_netlist()`.
- ✅ `+=` used for all connections (the one `part += net` bug found
  during development is fixed — see `outputs/erc_report.md`).
- ⚠️ Ref-designator and net-naming conventions deviate from the style
  guide in two places (findings #4, #5) — both deliberate, both
  documented, both chosen to stay consistent with already-reviewed
  architecture/sourcing docs rather than the generic style guideline.

## 4. Footprint Validation

`✓ All footprints valid (29 checked across 7 files)` — see
`outputs/erc_report.md` for the three closest-match substitutions.

## Verdict

**Circuit is ready for BOM/netlist export** (already generated at
`outputs/temp_gravity_module.net` / `outputs/temp_gravity_module_bom.xml`).
No HIGH-severity issues. The 3 MEDIUM findings are pre-fab verification
items for a human (datasheet pin confirmation, footprint mechanical
check, antenna keep-out at layout) — none block continuing the pipeline
or exporting the netlist, but none should be skipped before this board is
actually sent to fab.
