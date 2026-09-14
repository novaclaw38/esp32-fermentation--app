# Bench prototype — Temp + Gravity on a D1 Mini ESP32

The one build worth doing next. Everything else in `hardware/` specifies
custom SMD boards that need a fab run, so nothing in this repo has ever been
assembled — and two questions block every other number in the project:

1. **Which accelerometer axis runs along the housing?** Calibration step 1,
   and currently a guess written into the firmware as an assumption.
2. **Does the float angle sweep usefully across 1.000–1.080?** Depends on
   ballast and geometry. Nobody has measured it.

Neither is answerable on paper. Both are answerable on a breadboard, for
about **$8–17** on top of the board you already own.

*(Humidity and CO₂ modules are described in
[`MULTI_SENSOR_MODULES.md`](MULTI_SENSOR_MODULES.md) — deliberately out of
scope here.)*

---

## Parts

| Part | Qty | Cost | Notes |
|---|---|---|---|
| D1 Mini ESP32 board | 1 | — | You have this |
| ADXL345 breakout (GY-291) | 1 | $2–3 | Tilt sensing |
| DS18B20 waterproof probe | 1 | $2–3 | Right for bench work. The production board uses an on-board MCP9808 instead — the sketch detects which is present, so no code change when you switch |
| 4.7 kΩ resistor | 1 | ~$0.01 | DS18B20 1-Wire pull-up |
| 100 kΩ resistors | 2 | ~$0.02 | Battery divider |
| TP4056 module **with protection** | 1 | $0.50–1 | The 6-pad version with DW01A + FS8205. The 4-pad ones have no protection, and an over-discharged 18650 is a dead 18650 |
| 18650 holder | 1 | ~$0.50 | |
| 18650 cell (~2500 mAh) | 1 | $2–4 | |
| Breadboard or D1 Mini proto shield | 1 | $1–3 | |
| Jumper wires | — | $1–2 | |

**Total: ~$9–17.** For the gravity sweep you'll also want a hydrometer, table
sugar, and a tall container — see [Calibrating](#2-calibrating-the-curve).

---

## Wiring

The firmware's pin map works on this board **unchanged** — all five pins are
broken out, so `firmware/fermentation_tilt_v1/` flashes and runs as-is.

| Firmware | Board label | Connect to |
|---|---|---|
| `GPIO4` | `IO4` | DS18B20 data (yellow), **plus 4.7 kΩ to 3V3** |
| `GPIO21` | `SDA` | ADXL345 `SDA` |
| `GPIO22` | `SCL` | ADXL345 `SCL` |
| `GPIO34` | `IO34` | Battery divider midpoint |
| `GPIO25` | `IO25` | Divider enable — leave unconnected, see below |

```
  cell+ ──┬── TP4056 B+
          │
          └── 100kΩ ──┬── IO34
                      │
                   100kΩ
                      │
                     GND
```

At 4.2 V that puts **2.10 V** on GPIO34 — inside ADC1's range, and it matches
the firmware's `* 2.0` exactly. Nothing to change.

DS18B20: red → `3V3`, black → `GND`, yellow → `IO4`. Some probe modules have
the 4.7 kΩ already fitted — check before adding a second one.

ADXL345: `VCC` → `3V3`, `GND` → `GND`, `SDA` → `IO21`, `SCL` → `IO22`.

### Skip the Q1/Q2 divider gating

The PCB gates the divider with a PMOS+NPN pair so it draws nothing in sleep.
On a breadboard, don't bother: a permanent 200 kΩ divider draws ~21 µA, which
is irrelevant beside this board's own sleep current. Wire it straight to GND
and leave `IO25` unconnected. The firmware still toggles that pin and waits
30 ms before reading — harmless, and it means **the same sketch runs on both
the prototype and the real board**.

### Power

Cell → TP4056 `B+`/`B-`. TP4056 `OUT+` → the board's **`5V` pin**.

> **Never feed the cell into `3V3`.** A charged cell is 4.2 V; the ESP32's
> absolute maximum is 3.6 V. That kills the chip. The `5V` pin routes through
> the board's own regulator, which is what you want.

The cost is headroom: an ME6211-class LDO drops ~0.1–0.3 V under WiFi load,
so the rig browns out around a 3.4–3.6 V cell — you get the top 70–80% of
capacity. Fine for bench work.

**Charge through the TP4056's USB port, not the board's.** Both feed the same
rail and will fight each other. Disconnect the battery before flashing.

---

## 1. The axis test — five minutes, no housing needed

This is the highest-value thing in the whole project right now, and it needs
no float, no sugar, and no waterproofing.

1. Flash `firmware/fermentation_tilt_v1/` with your WiFi and device
   credentials filled in.
2. Open the serial monitor at 115200.
3. **Hold the board upright**, ADXL345's long axis vertical. The log should
   print a tilt near **0°**.
4. **Lay it flat.** It should print near **90°**.

If it reads inverted, or sits pinned near 90° in both positions, the board's
long axis isn't X. Change which of `x`/`y`/`z` `readTiltDegrees()` treats as
the long axis — the code comments mark the exact line.

**Do this before collecting a single calibration point.** A wrong axis makes
every later measurement garbage, which is precisely why the firmware's own
calibration procedure puts it first.

---

## 2. Calibrating the curve

Now you need a float: seal the rig in a candidate housing with ballast, so it
floats freely without touching the sides or bottom of the container. A tall
narrow vessel — a 1 L measuring cylinder or a tall jar — works better than a
wide one.

**Making known-gravity solutions.** Dissolve table sugar in water. Roughly
**0.38 gravity points per gram per litre**, so as starting points:

| Target SG | Sugar per litre |
|---|---|
| 1.010 | ~26 g |
| 1.020 | ~53 g |
| 1.040 | ~105 g |
| 1.060 | ~158 g |
| 1.080 | ~210 g |

**Measure each one with a hydrometer rather than trusting the table.** You
need the hydrometer as the reference anyway, and dissolved volume doesn't
track added mass exactly.

Then:

1. Hold every solution at the **same temperature**, and write that
   temperature down.
2. Record the tilt angle the rig reports in each. Three or four points
   spanning ~1.000–1.080 is enough.
3. Fit `SG = a·tilt³ + b·tilt² + c·tilt + d`. Zero the unused higher terms
   for a linear or quadratic fit.
4. Enter the coefficients **and the calibration temperature** on the device
   page in the dashboard.

> Step 4 matters more than it looks. Gravity is corrected to a 20 °C
> reference *relative to the calibration temperature*, not to an assumed
> 20 °C. Calibrating at 24 °C and leaving the field at 20 biases every
> reading by about half a gravity point, silently. Use hydrometer readings
> already corrected to 20 °C, too — otherwise a temperature error gets baked
> into the curve where no later correction can remove it.

**What you're really checking** is whether the angle moves *enough*. If the
rig reads 41° at 1.080 and 39° at 1.010, the concept doesn't work in that
housing with that ballast, and no amount of firmware fixes it — you change
the ballast or the geometry. Better to learn that now than after ordering 25
housings.

---

## What this rig will not tell you

**Battery life.** The D1 Mini ESP32 keeps its CH340C USB-serial chip and
regulator powered in deep sleep, so board-level sleep current sits in the
**milliamp** range rather than a bare module's ~20 µA. On the same 18650:

| Sleep current | Runtime |
|---|---|
| ~20 µA (bare module — the PCB design) | ~5 months |
| ~500 µA (dev board, optimistic) | ~12 weeks |
| ~1.5 mA (dev board, typical) | ~6 weeks |
| ~3 mA (dev board, pessimistic) | ~4 weeks |

Add the LDO headroom loss and prototype runtime could be an order of
magnitude short of the product figure. That's a property of the dev board,
not the design — don't read it as a failure, and don't quote it as a spec.

**Waterproofing or pressure.** Both are housing properties, and the housing
remains the largest unknown in the project.

---

## If something doesn't work

| Symptom | Most likely cause |
|---|---|
| `Error: no usable ADXL345 samples` | **I²C address.** The firmware expects `0x53`, which the ADXL345 reports with `SDO` tied **low**. Many GY-291 boards float or pull `SDO` high, giving `0x1D`. Tie `SDO` to GND, or change `ADXL345_ADDR` |
| Tilt pinned near 90° in every orientation | Wrong axis — see the axis test above |
| `Discarding tilt: \|a\| = …g` | Working as intended: the rig rejects readings whose acceleration isn't 0.8–1.2 g, meaning it was being handled. Put it down and wait a cycle |
| Erratic or CRC-failing temperatures | Counterfeit DS18B20 — widespread. Suspect the sensor before the code |
| Device never appears in the dashboard | Check the device ID and secret match the row you created, and that the board is on 2.4 GHz WiFi — the ESP32 has no 5 GHz radio |
| Gravity column stays empty | Expected until `calibration_c` is set. The view returns `null` rather than a plausible-looking wrong number |
