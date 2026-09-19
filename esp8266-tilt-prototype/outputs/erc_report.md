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

**PASS.** Ready for the wiring diagram to be used as-is. Remember: ERC
verifies netlist connectivity logic, not the physical-world unknowns
flagged in `../architecture/design_risks.md` (TP4056 breakout protection
status, D0-RST jumper presence, GY-291 SDO pull, A0 onboard-divider
possibility) — those need a multimeter and a visual check on the actual
boards, not a schematic tool.
