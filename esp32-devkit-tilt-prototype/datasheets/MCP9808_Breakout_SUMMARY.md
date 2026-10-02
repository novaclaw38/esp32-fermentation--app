# MCP9808 I2C Breakout — module-level summary (not used on this build)

**Not used as of the DHT11 swap** — this build's temperature sensor is
now a DHT11 on its own pin (`GPIO4`), see `DHT11_SUMMARY.md`. Kept here
for reference in case the MCP9808 is swapped back in (it's still the
preferred sensor on both the production board and the ESP8266 sibling
rig, which share auto-detect firmware logic this ESP32 sketch no longer
has after the DHT11 swap — reintroducing the MCP9808 here would need
that logic added back, not just rewiring).

Module-level equivalent of the production board's
[`../../datasheets/MCP9808T-E-MS_SUMMARY.md`](../../datasheets/MCP9808T-E-MS_SUMMARY.md)
(bare MSOP-8 IC). Same pre-assembled breakout module as the ESP8266
rig's [`../../esp8266-tilt-prototype/datasheets/MCP9808_Breakout_SUMMARY.md`](../../esp8266-tilt-prototype/datasheets/MCP9808_Breakout_SUMMARY.md)
— e.g. Adafruit #1782, or any equivalent MCP9808 breakout.

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
| SCL | `SCL` net (shared with GY-291, Dev Kit V1 `GPIO19`) |
| SDA | `SDA` net (shared with GY-291, Dev Kit V1 `GPIO21`) |
| ALERT (if present) | Not used — left `NC` |

## Verify before assuming

- **Address pins.** Confirm the specific board bought actually grounds
  `A0`/`A1`/`A2` by default (not all clones do) — same spirit as the
  GY-291's `SDO`/`CS` check in `../architecture/design_risks.md`.
- **Thermal coupling**, if this build progresses past bench testing:
  placement dominates accuracy for any I2C temp sensor — an unbonded
  sensor reading ambient air performs worse than the chip's own ±0.5°C
  spec suggests.

## Firmware

Not present in `firmware/fermentation_tilt_v1_esp32_devkit/` as of the
DHT11 swap — the MCP9808 read/probe functions (`mcp9808Begin()`,
`mcp9808ReadC()`, etc.) and the auto-detect branch in `readTemperature()`
were removed, replaced by a DHT11-only read path. Re-adding this sensor
here means restoring that code, not just rewiring the breakout.
