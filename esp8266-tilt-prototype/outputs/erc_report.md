# ERC Report — esp8266_tilt_prototype

**0 errors, 0 warnings. Circuit is PASS.**

Run: `KICAD7_SYMBOL_DIR=/usr/share/kicad/symbols KICAD7_FOOTPRINT_DIR=/usr/share/kicad/footprints .venv/bin/python -m circuits.esp8266_tilt_prototype` — 2026-09-19.

## Findings

One real bug caught and fixed during development, not present in this
final run:

| # | Severity | Message | Root cause | Fix |
|---|---|---|---|---|
| 1 | ERROR (fixed) | `Pin conflict on net BAT_PLUS, POWER-OUT <==> POWER-OUT` (×2, also on GND) | `charger.py`'s scratch-built TP4056 breakout part marked all 4 pads (`B+`/`B-`/`OUT+`/`OUT-`) as `PWROUT`. Two `PWROUT` pins on the same net reads to ERC as two independent power sources fighting — but `B+`/`OUT+` are the same internal node on the real board, just exposed on two pads, not two sources. | Changed all 4 pads to `PASSIVE` — correct for a black-box connector view of a module whose internal regulation isn't being modeled. |

## Footprint validation

`✓ All footprints valid (7 checked across 5 files)`.

## Verdict

**PASS.** Ready for the wiring diagram to be used as-is.

## Revision history

Re-run after two fixes, both still 0 errors/0 warnings:
- GY-291's `CS` pin changed from `NC` to wired to `3V3`, once the user's
  board photo showed `CS` is a dedicated header pin on this module, not
  internally tied — same reasoning as `SDO`.
- `battery_sense.py`'s R1/R2 changed from 330k/100k to 10k/22k, once the
  user confirmed (multimeter) this D1 Mini clone has its own onboard
  divider on `A0` — the external divider was redesigned as the first
  stage of a two-stage system rather than doing all the attenuation
  itself. See `../architecture/net_plan.md` for the derivation.

All four hardware items originally flagged in
`../architecture/design_risks.md` (TP4056 protection, GY-291 SDO/CS,
D0-RST jumper, A0 divider) are now resolved by the user against the
physical boards. ERC verifies netlist connectivity logic, not physical
reality — the remaining recommended-not-blocking checks (D0-RST
continuity, battery-reading calibration) still need a multimeter, not a
schematic tool.
