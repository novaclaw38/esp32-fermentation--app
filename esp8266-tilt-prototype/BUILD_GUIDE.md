# ESP8266 Bench Rig — Prototype Shield Build Guide

Temp + Gravity module bench prototype: D1 Mini (ESP8266) + TP4056 charger
+ GY-291 (ADXL345) mounted on an Arduino-style Prototype Shield v.5.

Rendered diagram + this same content as a single PDF:
[`outputs/protoshield_build_guide.pdf`](outputs/protoshield_build_guide.pdf).
Diagram alone (SVG): [`outputs/protoshield_build_diagram.svg`](outputs/protoshield_build_diagram.svg).

**This shield does not plug into the D1 Mini.** It's Arduino Uno-shaped
with Uno-spaced headers — a completely different pin pitch from the D1
Mini's own compact layout. Its Digital I/O / Analog In / ICSP headers go
unused here. What's actually useful is its perfboard prototyping area,
which you populate and wire by hand.

## Before you start — already confirmed on this hardware

- ✅ TP4056 breakout is **protected** (3 ICs: TP4056 + DW01A + FS8205A)
- ✅ GY-291 `SDO`/`CS` are dedicated pins, not internally tied
- ✅ D0-to-RST "SLEEP" jumper pad is **soldered** — recommend a quick
  multimeter continuity check before your first real deep-sleep cycle
- ✅ A0 has an onboard divider (~220kΩ/100kΩ) — the external divider
  below (10kΩ/22kΩ) is sized for it

## Step-by-step assembly

1. **Mount the D1 Mini.** Push its two 8-pin header rows straight down
   into two adjacent rows of the shield's perfboard grid (pin pitch
   matches exactly). Solder each pin from underneath. Orient it so the
   micro-USB port faces an open edge of the shield — you'll want it
   accessible for reflashing.
2. **Mount the TP4056 charger breakout.** Position it near a board edge
   so its micro-USB charging port stays reachable from outside the
   finished assembly. Tack it down (hot glue or double-sided tape is
   fine — it doesn't need to be soldered flat, just held still).
3. **Mount the GY-291 and mark its axis.** Position it away from the
   charger section (keeps switching noise off the I2C lines). **Before
   securing it, note which way the board's printed "X" axis arrow
   points** — mark this on the shield itself (a sharpie arrow works).
   This is your reference for the firmware's axis-calibration step
   later; repositioning the board after calibration means redoing that
   step.
4. **Wire the charger to the D1 Mini.** Two short wires: TP4056 `OUT+`
   → D1 Mini `5V`, and TP4056 `OUT-` → D1 Mini `GND`. The D1 Mini's
   onboard regulator runs fine from the cell voltage directly — no
   separate LDO needed.
5. **Wire the D1 Mini to the GY-291.** Four wires: D1 Mini `3V3` →
   GY-291 `VCC`, `GND` → `GND`, `D2` → `SDA`, `D1` → `SCL`. **Also wire
   GY-291 `SDO` → `GND` and `CS` → `3V3`** (both are dedicated pins on
   this board, not internally tied — confirmed from your photo).
6. **Wire the DS18B20 probe.** D1 Mini `D6` → probe `DATA`, plus a
   4.7kΩ pull-up resistor between `DATA` and `3V3` (skip the resistor
   if your probe already has one built in — check first). Probe `VCC`
   → `3V3`, `GND` → `GND`.
7. **Wire the battery.** 18650 cell (in its own holder, off the shield)
   → TP4056 `B+`/`B-`. Keep the holder separate rather than gluing it
   down — you'll be swapping/recharging it often during calibration.

Steps 4-7 can be done in any order — the numbering matches the diagram's
callouts for cross-reference, not a strict sequence. Just avoid powering
anything on until every wire in a given connection is in place (e.g.
don't connect the battery with only one of B+/B- wired).

## Power-on and first boot

8. **First power-up: USB only, no battery yet.** Plug the D1 Mini's own
   micro-USB into your computer. Open a serial monitor at 115200 baud.
   You should see boot messages — if nothing prints, check the USB
   cable isn't charge-only and that you selected the right serial port.
9. **Flash the firmware.** Open
   `firmware/fermentation_tilt_v1_esp8266/fermentation_tilt_v1_esp8266.ino`,
   fill in the CONFIG section (WiFi, Supabase URL/key, device
   ID/secret), select board **"LOLIN(WEMOS) D1 R2 & mini"** in the
   Arduino IDE, and upload.
10. **Run the axis test.** Hold the assembled rig upright (GY-291's
    marked X-axis vertical) — the serial log should print a tilt near
    0°. Lay it flat — near 90°. If it's inverted or pinned near 90° in
    both positions, the firmware's axis assumption doesn't match your
    mounting; swap which axis `readTiltDegrees()` treats as the long
    one (comment in the code marks the line). Do this before any
    calibration data collection — a wrong axis makes every later
    reading garbage.
11. **Connect the battery, confirm deep sleep actually wakes.** Wire
    the cell in (step 7), let the unit go through one full sleep/wake
    cycle (default 900s), and confirm it reconnects and posts a
    reading. This is the real test of the D0-RST jumper — if the board
    never comes back, that joint needs reflowing.

## Reference tables

| Connection | From | To | Notes |
|---|---|---|---|
| Power | TP4056 OUT+ | D1 Mini 5V | Same node as BAT+ |
| Ground | TP4056 OUT- | D1 Mini GND | |
| Power | D1 Mini 3V3 | GY-291 VCC | |
| I2C | D1 Mini D2 | GY-291 SDA | GPIO4 |
| I2C | D1 Mini D1 | GY-291 SCL | GPIO5 |
| Address set | GY-291 SDO | GND | I2C address 0x53 |
| Mode set | GY-291 CS | 3V3 | Forces I2C mode |
| 1-Wire | D1 Mini D6 | DS18B20 DATA | GPIO12, + 4.7kΩ pull-up to 3V3 |
| ADC | BAT+ | D1 Mini A0 | via 10kΩ/22kΩ external divider |
| Wake | D0 | RST | "SLEEP" pad, already soldered |

| Part | Qty | Notes |
|---|---|---|
| 10kΩ resistor | 1 | Battery divider top (R1) |
| 22kΩ resistor | 1 | Battery divider bottom (R2) |
| 4.7kΩ resistor | 1 | 1-Wire pull-up (only if probe lacks one) |
| 18650 cell + holder | 1 | ~2500mAh |
| Jumper wires | ~15 | Solid-core preferred for perfboard soldering |

See `SPEC.md`, `architecture/net_plan.md`, and
`architecture/design_risks.md` for the full electrical derivation and
design history behind these connections.
