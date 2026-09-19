# GY-291 (ADXL345 breakout) — Module Reference

Breakout-module-level summary — the bare ADXL345 IC's full datasheet
summary already exists at `../../datasheets/ADXL345BCCZ-RL7_SUMMARY.md`
from the production-board pipeline; this covers what differs on a
GY-291 carrier board specifically.

| Spec | Value |
|------|-------|
| IC | ADXL345 (3-axis accelerometer) |
| Interface | I2C — confirm `CS` handling per this specific board (see below) |
| Vcc | 3.3-5V tolerant on most GY-291 clones (onboard regulator + level shifting) — confirm on this specific board before assuming 5V-safe |

## Header pins — confirmed by user photo

Board silkscreen (left to right): `SCL SDA SDO INT2 INT1 CS VCC GND`,
plus a printed X/Y/Z axis diagram next to the mounting holes — see the
axis note below.

| Pin | Function here |
|---|---|
| `VCC` | D1 Mini `3V3` |
| `GND` | `GND` |
| `SDA` | D1 Mini `D2` (GPIO4) |
| `SCL` | D1 Mini `D1` (GPIO5) |
| `SDO` | **`GND`** — sets I2C address 0x53. Confirmed as its own dedicated header pin on this board (not internally tied) — must be wired |
| `CS` | **`3V3`** — also its own dedicated header pin on this board, same as SDO. **Not assumed tied internally** (the earlier "usually tied high on most clones" guess doesn't hold here since it's clearly broken out). Wired explicitly in `circuits/esp8266_tilt_prototype/sensor_bus.py` rather than left floating — an unconnected CMOS input risks an unwanted SPI-mode switch or erratic I2C |
| `INT1`/`INT2` | Not used — `NC` |

## Axis diagram — printed on the board

The user's specific board has an **X/Y/Z axis diagram silkscreened next
to the mounting holes**. This directly informs the firmware's "AXIS
ASSUMPTION" calibration step (`readTiltDegrees()` in
`firmware/fermentation_tilt_v1_esp8266/`) — orient the board so the
printed `X` arrow runs along the housing's intended long axis before
running the axis test, rather than guessing and correcting after the
fact. Still confirm empirically (hold upright, check ~0°; lay flat,
check ~90°) — the diagram tells you where to start, not a substitute for
the test itself.

## The confirmed gotcha

`hardware/PROTOTYPE_TEMP_GRAVITY.md`'s own troubleshooting table lists
this exact failure: `Error: no usable ADXL345 samples` → root cause
"I²C address. The firmware expects 0x53, which the ADXL345 reports with
SDO tied low. Many GY-291 boards float or pull SDO high, giving 0x1D.
Tie SDO to GND, or change ADXL345_ADDR." Wire `SDO` to `GND` explicitly
rather than assuming the module already does it.
