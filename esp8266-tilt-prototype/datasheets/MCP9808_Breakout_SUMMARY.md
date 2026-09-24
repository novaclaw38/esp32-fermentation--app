# MCP9808 I2C Breakout — module-level summary (bench prototype)

Module-level equivalent of the production board's
[`../../datasheets/MCP9808T-E-MS_SUMMARY.md`](../../datasheets/MCP9808T-E-MS_SUMMARY.md)
(bare MSOP-8 IC). This bench rig uses a pre-assembled **breakout module**
instead — e.g. Adafruit #1782, or any equivalent MCP9808 breakout — so
there's no IC-level footprint/placement concern, just a 4-5 pin header.

Swapped in for the DS18B20 TO-92 probe originally speced for this rig:
the TO-92 package was too bulky for a PCB-mounted build, and the MCP9808
shares the GY-291's already-present I2C bus at no extra wiring cost.

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
| VDD | `D1MINI_3V3` |
| GND | `GND` |
| SCL | `SCL` net (shared with GY-291) |
| SDA | `SDA` net (shared with GY-291) |
| ALERT (if present) | Not used — left `NC` |

## Verify before assuming

- **Address pins.** Confirm the specific board bought actually grounds
  `A0`/`A1`/`A2` by default (not all clones do) — same spirit as the
  GY-291's `SDO`/`CS` check in `../architecture/design_risks.md`. If they
  float or are pulled differently, the I2C address won't be `0x18` and
  the firmware's `mcp9808Begin()` will fail to find the sensor (falling
  through to the DS18B20 path, which isn't wired on this build, so
  temperature readings would simply fail — not silently wrong).
- **Thermal coupling**, if this build progresses past bench testing:
  placement dominates accuracy for any I2C temp sensor, same caveat as
  the production board's bare-IC summary — an unbonded sensor reading
  ambient air performs worse than the chip's own ±0.5°C spec suggests.

## Firmware

No firmware change was needed for this swap. `mcp9808Begin()` already
runs before the DS18B20 fallback path in `setup()` in both
`firmware/fermentation_tilt_v1_esp8266/` and the production
`firmware/fermentation_tilt_v1/` sketch — the MCP9808 is auto-detected
and preferred whenever it's present on the bus.
