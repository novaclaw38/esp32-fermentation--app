# TP4056 — Li-ion linear charge controller (TPOWER)

LCSC C382139 · [Datasheet](https://www.lcsc.com/datasheet/lcsc_datasheet_1912111437_TPOWER-TP4056_C382139.pdf)
· PDF download failed (HTML redirect, not a real PDF) — no file written for this part, per the "skip PDF, summary is enough" rule.

| Spec | Value |
|------|-------|
| Package | ESOP-8 (SOP-8) |
| Vcc / Vin range | 4V–6V (from USB-C VBUS) |
| Charge current | Programmable up to 1A (set by PROG resistor, `I_charge ≈ 1200/R_PROG`) |
| Charging saturation voltage | 4.2V |
| Quiescent current | 1µA |
| Operating temp | -40°C to +85°C |

## Pinout (standard TP4056 8-SOP, widely documented — verify against the
manufacturer PDF before finalizing the SKiDL part footprint)

| Pin | Name | Function |
|-----|------|----------|
| 1 | TEMP | Battery temperature sense (tie to GND if unused) |
| 2 | PROG | Charge-current set resistor to GND — R9 = 1.2kΩ here |
| 3 | GND | Ground |
| 4 | VCC | Input power (from USB-C VBUS) |
| 5 | BAT | Battery connection (to protection stage, U3/U4) |
| 6 | STDBY | Open-drain, active-low, charge complete — drives D2 (green) |
| 7 | CHRG | Open-drain, active-low, charging in progress — drives D1 (red) |
| 8 | CE | Chip enable, active-low — tie to GND to always enable |

## Notes
- **Not sufficient alone for battery protection** — this design pairs it
  with DW01A (U3) + FS8205A (U4) between the cell and TP4056/load, per
  `architecture/design_risks.md`.
- R9 = 1.2kΩ gives ~1A (0.40C on a 2500mAh cell) — re-size if cell
  capacity changes.
- CHRG/STDBY are open-drain outputs — the LED+resistor pull-up wiring in
  `net_plan.md` (through R13/R14 to 3V3) is the correct topology, not a
  push-pull driver.
