# DW01A — Li-ion battery protection IC (PUOLOP)

LCSC C351410 · [Datasheet](https://www.lcsc.com/datasheet/lcsc_datasheet_1912111437_PUOLOP-DW01A_C351410.pdf)
· PDF download failed (HTML redirect, not a real PDF) — no file written for this part, per the "skip PDF, summary is enough" rule.

| Spec | Value |
|------|-------|
| Package | SOT-23-6L |
| Supply range | 300mV–10V |
| Overcharge detection | 4.3V |
| Over-discharge detection | 2.5V |
| Quiescent current | 3µA |
| Operating temp | -40°C to +85°C |
| Function | Overcharge, over-discharge, overcurrent, short-circuit protection for 1S Li-ion, paired with an external dual-MOSFET (FS8205A, U4) |

## Pinout — ⚠️ not independently verified

**This design uses DW01A + FS8205A in the standard reference-design
pairing** (the combination found on nearly every commercial TP4056
protection breakout), but the exact SOT-23-6 pin-to-function mapping was
**not confirmed against the manufacturer PDF** in this pass (PDF download
failed, and guessing pin numbers on a protection IC is worse than leaving
it unresolved). Before the SKiDL coder builds this part's symbol:

1. Pull the datasheet PDF manually from the LCSC URL above (or the
   PUOLOP manufacturer page), or
2. Cross-reference against a known-good DW01A+FS8205A reference schematic
   (widely published — e.g. any generic TP4056-protected breakout board
   schematic uses this exact pairing).

**Functional pin roles to confirm**: VDD (cell+, through the protection
path), VSS/GND, CS (current-sense, ties to FS8205A's shared source node),
DO (discharge-FET gate control), CO (charge-FET gate control). Do not
proceed to SKiDL coding on this part without pinning these down — a
transposed pin here silently disables the over-discharge protection the
SPEC.md explicitly requires.
