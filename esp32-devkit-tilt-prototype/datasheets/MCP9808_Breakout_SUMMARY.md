# MCP9808 I2C Breakout — module-level summary (bench prototype)

Module-level equivalent of the production board's
[`../../datasheets/MCP9808T-E-MS_SUMMARY.md`](../../datasheets/MCP9808T-E-MS_SUMMARY.md)
(bare MSOP-8 IC). Same pre-assembled breakout module as the ESP8266
rig's [`../../esp8266-tilt-prototype/datasheets/MCP9808_Breakout_SUMMARY.md`](../../esp8266-tilt-prototype/datasheets/MCP9808_Breakout_SUMMARY.md)
— e.g. Adafruit #1782, or any equivalent MCP9808 breakout — reuse the
same physical module across both rigs if you have one.

Preferred sensor on this build (same auto-detect priority as the
production and ESP8266 firmware); a DS18B20 on `GPIO4` remains the
automatic fallback if no MCP9808 answers.

| Spec | Value |
|------|-------|
| Interface | I2C |
| Address | `0x18` (assumes `A0`/`A1`/`A2` default grounded — true on Adafruit #1782 and most clones) |
| Accuracy | ±0.5°C (chip spec; breakout-level accuracy depends on the specific board) |
| Vcc range | 2.7V–5.5V (fine off this board's 3V3 rail) |
| Resolution | 13-bit |

## Pinout used here (typical 4-5 pin breakout header)

| Pin | Function here |
|-----|----------------|
| VDD | `DEVKIT_3V3` |
| GND | `GND` |
| SCL | `SCL` net (shared with GY-291, Dev Kit V1 `GPIO22`) |
| SDA | `SDA` net (shared with GY-291, Dev Kit V1 `GPIO21`) |
| ALERT (if present) | Not used — left `NC` |

## Verify before assuming

- **Address pins.** Confirm the specific board bought actually grounds
  `A0`/`A1`/`A2` by default (not all clones do) — same spirit as the
  GY-291's `SDO`/`CS` check in `../architecture/design_risks.md`. If they
  float or are pulled differently, the I2C address won't be `0x18` and
  the firmware's `mcp9808Begin()` will fail to find the sensor, falling
  through to the DS18B20 path instead.
- **Thermal coupling**, if this build progresses past bench testing:
  placement dominates accuracy for any I2C temp sensor — an unbonded
  sensor reading ambient air performs worse than the chip's own ±0.5°C
  spec suggests.

## Firmware

No firmware change was needed for this sensor choice — it's the same
auto-detect logic already present in the production
`firmware/fermentation_tilt_v1/` sketch (`mcp9808Begin()` runs before
the DS18B20 fallback in `setup()`), reused unchanged in
`firmware/fermentation_tilt_v1_esp32_devkit/`.
