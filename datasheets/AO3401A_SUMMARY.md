# AO3401A — P-channel MOSFET (Alpha & Omega Semicon)

LCSC C15127 · [Datasheet](https://www.lcsc.com/datasheet/lcsc_datasheet_2412061733_Alpha---Omega-Semicon-AO3401A_C15127.pdf)
· PDF download failed (HTML redirect, not a real PDF) — no file written for this part, per the "skip PDF, summary is enough" rule.

| Spec | Value |
|------|-------|
| Package | SOT-23 |
| Type | P-channel MOSFET |
| Vds | 30V |
| Id (continuous) | 4A |
| Gate threshold Vgs(th) | 900mV |
| RDS(on) | 47mΩ @10V, 60mΩ @4.5V, 85mΩ @2.5V |
| Function | Q1 — high-side gate for the battery-sense divider (R1/R2) |

## Pinout (standard SOT-23 MOSFET pinout: 1-Gate, 2-Source, 3-Drain)

| Pin | Name | Function here |
|-----|------|----------------|
| 1 | Gate | ← R6 (100kΩ pull-up to `BAT+`) and ← Q2 collector |
| 2 | Source | → `BAT+` |
| 3 | Drain | → R1 (divider top) |

## Notes
- **Vgs(th) = 900mV confirms the design-risk note in `architecture/design_risks.md`**:
  on a freshly-charged cell (4.2V), a direct GPIO (3.3V HIGH) drive to
  this gate would leave V_GS around -0.9V — inside the threshold region,
  not solidly off. Q2 (MMBT3904 NPN) as a low-side switch is required, not
  optional, to guarantee full off.
