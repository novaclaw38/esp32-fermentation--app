# GY-291 (ADXL345 breakout) — Module Reference

Breakout-module-level summary — the bare ADXL345 IC's full datasheet
summary already exists at `../../datasheets/ADXL345BCCZ-RL7_SUMMARY.md`
from the production-board pipeline; this covers what differs on a
GY-291 carrier board specifically.

| Spec | Value |
|------|-------|
| IC | ADXL345 (3-axis accelerometer) |
| Interface | I2C (this module ties `CS` high internally on most clones, forcing I2C mode) |
| Vcc | 3.3-5V tolerant on most GY-291 clones (onboard regulator + level shifting) — confirm on this specific board before assuming 5V-safe |

## Header pins (typical GY-291 silkscreen)

| Pin | Function here |
|---|---|
| `VCC` | D1 Mini `3V3` |
| `GND` | `GND` |
| `SDA` | D1 Mini `D2` (GPIO4) |
| `SCL` | D1 Mini `D1` (GPIO5) |
| `SDO` | **`GND`** — sets I2C address 0x53. Confirmed gotcha on this clone family (see below), not every GY-291 ties this internally |
| `CS` | Usually tied high on-module already (I2C mode) — leave unconnected unless the specific board's silkscreen says otherwise |

## The confirmed gotcha

`hardware/PROTOTYPE_TEMP_GRAVITY.md`'s own troubleshooting table lists
this exact failure: `Error: no usable ADXL345 samples` → root cause
"I²C address. The firmware expects 0x53, which the ADXL345 reports with
SDO tied low. Many GY-291 boards float or pull SDO high, giving 0x1D.
Tie SDO to GND, or change ADXL345_ADDR." Wire `SDO` to `GND` explicitly
rather than assuming the module already does it.
