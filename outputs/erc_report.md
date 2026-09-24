# ERC Report — temp_gravity_module

**0 errors, 1 warning, 0 notes. Circuit is PASS.**

Run: `KICAD7_SYMBOL_DIR=/usr/share/kicad/symbols KICAD7_FOOTPRINT_DIR=/usr/share/kicad/footprints .venv/bin/python -m circuits.temp_gravity_module` — 2026-09-18.

## Summary

| Metric | Result |
|---|---|
| ERC errors | 0 |
| ERC warnings | 1 |
| Footprint validation | 29/29 valid (`validate-footprints.py` exit 0) |
| Netlist | `outputs/temp_gravity_module.net` (1639 lines) |
| BOM XML | `outputs/temp_gravity_module_bom.xml` (388 lines) |

## Findings

| # | Severity | Message | Root cause | Verdict |
|---|---|---|---|---|
| 1 | INFO | `Merging two named nets (CELL_MINUS and GND) into GND` | `charge_protection.py` deliberately ties `CELL_MINUS` (the cell's negative terminal, downstream of the DW01A/FS8205A protection FETs) to system `GND` — the protection stage's job is exactly to make these the same electrical node once the FETs are closed. Two named nets merging into one is SKiDL's standard notice for this, not a defect. | **False positive — expected, no action** |

No ERC errors were found on this pass. Two earlier iterations (not shown
here, fixed before this report) caught:
- A `part += net` vs `part[pin] += net` bug that left C5/C6 pin 1
  floating (SKiDL flagged it as "Unconnected pin").
- ESP32 GPIO35 (SENSOR_VN's pair pin) missing from the no-connect list.

Neither recurs in this run.

## Footprint validation

`python3 scripts/validate-footprints.py circuits/temp_gravity_module/` →
`✓ All footprints valid (29 checked across 7 files)`.

Three footprints are closest-available-match substitutions rather than
exact-part matches, each commented in the source and carried into
`design_review.md` below rather than hidden:
- ESP32 module: `RF_Module:ESP32-WROOM-32` (no -32E-specific footprint in
  the standard library; same mechanical outline).
- ADXL345: `Package_LGA:LGA-14_3x5mm_P0.8mm_LayoutBorder1x6y` (closest
  package/size match; exact pad pitch not confirmed against ADXL345's
  mechanical drawing).
- SW1: switched part from the sourced BOM's TS-1088-AR02016 to
  TS-1187A-B-A-B (LCSC C318884) specifically because the latter has a
  real KiCad footprint and the former does not.

## Verdict

**PASS.** Errors == 0 and footprint validation passes. Cleared for
netlist/BOM export (already generated). DW01A/FS8205A pin-number
provisional status and the LGA-14 footprint match are **not** ERC or
footprint-validation failures — they're physical/mechanical verification
items for a human before fab, tracked in
`datasheets/DW01A_SUMMARY.md`, `datasheets/FS8205A_SUMMARY.md`, and
`outputs/design_review.md`.
