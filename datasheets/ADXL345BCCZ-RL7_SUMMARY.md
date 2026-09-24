# ADXL345BCCZ-RL7 — 3-axis accelerometer (Analog Devices)

LCSC C9667 · [Datasheet](https://www.lcsc.com/datasheet/lcsc_datasheet_2410121747_Analog-Devices-ADXL345BCCZ-RL7_C9667.pdf)
· PDF download failed (HTML redirect, not a real PDF) — no file written for this part, per the "skip PDF, summary is enough" rule.

| Spec | Value |
|------|-------|
| Package | LGA-14 (3×5mm) |
| Vcc / Vin range | 2.0V–3.6V |
| Interface | I2C or SPI (selected by CS pin) |
| Resolution | 13-bit, ±16g range |
| Standby current | 100nA |
| Operating temp | -40°C to +85°C |
| Function | Tilt/gravity sensing — float angle → specific gravity via calibration curve |

## Pinout (standard ADXL345 LGA-14, widely documented — verify exact pin
numbers against the manufacturer PDF before finalizing the SKiDL footprint)

| Pin | Name | Function here |
|-----|------|----------------|
| — | VDD | `3V3` |
| — | GND / VSS (×2) | `GND` |
| — | SDA | I2C data → `SDA` net (shared with MCP9808) |
| — | SCL | I2C clock → `SCL` net (shared with MCP9808) |
| — | SDO/ALT ADDRESS | Tie to GND → I2C address **0x53** |
| — | CS | Tie to 3V3 → selects I2C mode (SPI mode is CS low) |
| — | (unused: SDIO, INT1, INT2, NC) | Not used in this design — leave floating/NC per datasheet |

## Notes
- Decoupling: C10 (0.1µF, VDD I/O) + C11 (1µF, VS) per BOM — the
  datasheet specifically calls for 1µF at VS, not the usual 0.1µF.
- Single-source part (Analog Devices proprietary) — flagged in
  `sourcing/sourced_bom.md`.
- **The tilt-axis assumption (which physical axis runs along the
  housing) is unvalidated** — out of scope for this board's electrical
  design, resolved by the calibration procedure in
  `hardware/PROTOTYPE_TEMP_GRAVITY.md`.
