# GY-291 (ADXL345 breakout) — Module Reference

Breakout-module-level summary — the bare ADXL345 IC's full datasheet
summary already exists at `../../datasheets/ADXL345BCCZ-RL7_SUMMARY.md`
from the production-board pipeline; this covers what differs on a
GY-291 carrier board specifically.

**If this is the same physical GY-291 board already verified for the
ESP8266 rig** (`../../esp8266-tilt-prototype/datasheets/GY-291_ADXL345_SUMMARY.md`),
its findings carry over directly: `SDO`/`CS` confirmed as dedicated
header pins (not internally tied), silkscreen order `SCL SDA SDO INT2
INT1 CS VCC GND`, printed X/Y/Z axis diagram. If it's a *different*
physical board, re-verify — not all GY-291 clones are identical.

| Spec | Value |
|------|-------|
| IC | ADXL345 (3-axis accelerometer) |
| Interface | I2C — confirm `CS` handling per the specific board (see below) |
| Vcc | 3.3-5V tolerant on most GY-291 clones (onboard regulator + level shifting) — confirm before assuming 5V-safe |

## Header pins (assuming the same board as the ESP8266 rig)

| Pin | Function here |
|---|---|
| `VCC` | Dev Kit V1 `3V3` |
| `GND` | `GND` |
| `SDA` | Dev Kit V1 `GPIO23` (moved from `GPIO21`, damaged pad) |
| `SCL` | Dev Kit V1 `GPIO22` |
| `SDO` | **`GND`** — sets I2C address 0x53. Wire explicitly rather than assume |
| `CS` | **`3V3`** — forces I2C mode, avoids a floating CMOS input. Wire explicitly |
| `INT1`/`INT2` | Not used — `NC` |

## Axis diagram

If the same physical board as the ESP8266 rig, it has an X/Y/Z axis
diagram silkscreened next to the mounting holes — orient the printed
`X` arrow along the housing's intended long axis before running the
firmware's axis-calibration test (hold upright, check ~0°; lay flat,
check ~90°).

## The confirmed gotcha

`hardware/PROTOTYPE_TEMP_GRAVITY.md`'s own troubleshooting table lists
this exact failure: `Error: no usable ADXL345 samples` → root cause
"I²C address. The firmware expects 0x53, which the ADXL345 reports with
SDO tied low. Many GY-291 boards float or pull SDO high, giving 0x1D.
Tie SDO to GND, or change ADXL345_ADDR." Wire `SDO` to `GND` explicitly
rather than assuming the module already does it.
