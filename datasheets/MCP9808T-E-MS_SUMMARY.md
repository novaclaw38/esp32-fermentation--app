# MCP9808T-E/MS — I2C temperature sensor, ±0.5°C (Microchip)

LCSC C129490 · [Datasheet](https://www.lcsc.com/datasheet/lcsc_datasheet_1810010808_Microchip-Tech-MCP9808T-E-MS_C129490.pdf)
· PDF download failed (HTML redirect, not a real PDF) — no file written for this part, per the "skip PDF, summary is enough" rule.

| Spec | Value |
|------|-------|
| Package | MSOP-8 |
| Vcc / Vin range | 2.7V–5.5V |
| Interface | I2C / SMBus |
| Accuracy | ±0.5°C |
| Resolution | 13-bit |
| Conversion time | 250ms |
| Detection range | -40°C to +125°C |

## Pinout (standard MCP9808 MSOP-8, widely documented — verify exact pin
numbers against the manufacturer PDF before finalizing the SKiDL footprint)

| Pin | Name | Function here |
|-----|------|----------------|
| — | VDD | `3V3` |
| — | GND | `GND` |
| — | SDA | I2C data → `SDA` net (shared with ADXL345) |
| — | SCL | I2C clock → `SCL` net (shared with ADXL345) |
| — | A0, A1, A2 | Address select — tie all to GND → I2C address **0x18** |
| — | Alert (open-drain) | Not used in this design — leave NC or pull to 3V3 if used later |

## Notes
- **Placement dominates accuracy here.** Must be thermally bonded to the
  housing wall (thermal gap filler/epoxy) — a ±0.25°C-class part reading
  still internal air performs worse than a ±0.5°C part properly coupled
  to the wall. Layout needs copper relief keeping this part away from the
  ESP32 module and LDO (both are relative heat sources).
- Single-source part (Microchip proprietary) — flagged in
  `sourcing/sourced_bom.md`. Stock (897 units at time of sourcing) is the
  closest to the warning threshold of any part on this board.
- DS18B20 remains the documented fallback if on-board thermal bonding
  proves impractical for a given housing — firmware auto-detects which
  sensor is present (`R3`/`ONE_WIRE` net, conditionally populated).
