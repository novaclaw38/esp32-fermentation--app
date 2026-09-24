# FS8205A — Dual N-channel protection MOSFET (TECH PUBLIC)

LCSC C2830320 · [Datasheet](https://www.lcsc.com/datasheet/lcsc_datasheet_2108132230_TECH-PUBLIC-FS8205A_C2830320.pdf)
· PDF download failed (HTML redirect, not a real PDF) — no file written for this part, per the "skip PDF, summary is enough" rule.

| Spec | Value |
|------|-------|
| Package | SOT-23-6 |
| Configuration | 2× N-channel, common source |
| Drain-source voltage | 20V |
| Continuous drain current | 6A |
| RDS(on) | 31.5mΩ @2.5V Vgs |
| Gate threshold | 1.2V |
| Operating temp | -55°C to +150°C |
| Function | Charge/discharge switch pair, gate-driven by DW01A (U3) |

## Pinout — ⚠️ not independently verified

Same caveat as `DW01A_SUMMARY.md`: this part is used in the standard
DW01A+FS8205A reference pairing, but exact SOT-23-6 pin numbering was not
confirmed against the manufacturer PDF (download failed). Functional pin
roles to confirm before SKiDL coding: two independent gates (driven by
DW01A's DO/CO outputs), a shared source node (to DW01A's CS pin), and two
drains (one to cell-, one to system GND/load path). Resolve alongside
DW01A's pinout — they're a matched pair and must be wired consistently.
