# MMBT3904 — NPN transistor (Jiangsu Changjing Electronics)

LCSC C20526 · [Datasheet](https://www.lcsc.com/datasheet/lcsc_datasheet_2207041900_Jiangsu-Changjing-Electronics-Technology-Co---Ltd--MMBT3904-RANGE-100-300_C20526.pdf)
· PDF download failed (HTML redirect, not a real PDF) — no file written for this part, per the "skip PDF, summary is enough" rule.

| Spec | Value |
|------|-------|
| Package | SOT-23 |
| Type | NPN, general-purpose switching |
| Vceo | 40V |
| Ic (continuous) | 200mA |
| DC current gain (hFE) | ~100 |
| Transition frequency | 300MHz |
| Function | Q2 — low-side switch for Q1's (AO3401A) gate |

## Pinout (standard SOT-23 BJT pinout: 1-Base, 2-Emitter, 3-Collector)

| Pin | Name | Function here |
|-----|------|----------------|
| 1 | Base | ← R10 (10kΩ) ← ESP32 GPIO25 (`DIV_EN`) |
| 2 | Emitter | → `GND` |
| 3 | Collector | → Q1's gate |

## Notes
- **This part number corrects `hardware/BOM_TEMP_GRAVITY.md`'s LCSC
  C8598**, which resolves to a B5819W Schottky diode, not an MMBT3904 —
  see `architecture/ic_selection.md` and `sourcing/sourced_bom.md` for
  the correction trail.
- Basic tier, preferred, huge stock (290k+) — no sourcing risk.
- GPIO25 HIGH → base current through R10 → Q2 saturates → pulls Q1's
  gate to ~0V relative to GND, which (referenced to Q1's source at
  `BAT+`) is strongly negative V_GS → Q1 on. GPIO25 LOW/floating → Q2 off
  → R6 pulls Q1's gate to `BAT+` → V_GS = 0 → Q1 solidly off regardless
  of cell voltage.
