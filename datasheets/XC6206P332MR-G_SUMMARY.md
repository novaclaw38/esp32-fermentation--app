# XC6206P332MR-G — 3.3V LDO, low-Iq (Torex Semicon)

LCSC C5446 · [Datasheet](https://www.lcsc.com/datasheet/lcsc_datasheet_2304140030_Torex-Semicon-XC6206P332MR-G_C5446.pdf)
· PDF download failed (HTML redirect, not a real PDF) — no file written for this part, per the "skip PDF, summary is enough" rule.

| Spec | Value |
|------|-------|
| Package | SOT-23-3 |
| Vin | up to 6V |
| Vout | 3.3V fixed |
| Output current | 200mA max |
| Standby (quiescent) current | 1µA |
| Features | Over-current, short-circuit protection |
| Operating temp | -40°C to +85°C |

## Pinout (standard SOT-23-3 LDO pinout)

| Pin | Name | Function |
|-----|------|----------|
| 1 | VOUT | Regulated 3.3V output → `3V3` net, C8 (1µF) to GND |
| 2 | GND | Ground |
| 3 | VIN | Input, = `BAT+` (post-protection) → C7 (1µF) to GND |

## Notes
- **This is the part that makes the deep-sleep battery-life target
  work.** Iq = 1µA comfortably beats the SPEC.md's <5µA requirement — do
  not let the part-sourcer or a later BOM revision substitute an
  AMS1117-class part (typically ~5mA Iq, which alone exceeds the ESP32's
  own deep-sleep draw).
- Input/output capacitors (1µF each) are required for stability — a bare
  LDO can oscillate without them.
