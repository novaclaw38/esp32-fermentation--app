# Prototype build — off-the-shelf modules on a D1 Mini ESP32

Everything else in `hardware/` describes a custom SMD board you can't build
without a fab run. This is the other path: the same four sensing functions
assembled from **breakout modules and jumper wires**, on the D1 Mini ESP32
you already have.

**This is the most useful thing to build next.** Two questions block the
whole project and neither can be answered on paper:

- **Which accelerometer axis runs along the housing?** Step 1 of the
  calibration procedure, and currently a guess.
- **Does the float angle actually sweep usefully across 1.000–1.080?**
  Depends on ballast and housing geometry; nobody has measured it.

A breadboard rig answers both in an evening, for the price of one module.

---

## The base rig — shared by every module

| Part | Qty | Cost | Notes |
|---|---|---|---|
| D1 Mini ESP32 board | 1 | — | You have this. Any ESP32 devkit works; pin labels below are for this one |
| TP4056 module **with protection** | 1 | $0.50–1 | Get the 6-pad version with DW01A+FS8205 on board. The 4-pad ones have no protection — an over-discharged 18650 is a dead 18650 |
| 18650 holder | 1 | ~$0.50 | |
| 18650 cell (~2500mAh) | 1 | $2–4 | |
| 100kΩ resistors | 2 | ~$0.02 | Battery divider |
| Breadboard or D1 Mini proto shield | 1 | $1–3 | |
| Jumper wires | — | $1–2 | |

**Base total: roughly $5–11** on top of the board you own.

### Wiring — D1 Mini ESP32

All five pins the firmware uses are broken out on this board, so
`fermentation_tilt_v1.ino` runs **with no pin changes at all**:

| Firmware pin | Board label | Goes to |
|---|---|---|
| `GPIO4` | `IO4` | DS18B20 data (+ 4.7kΩ pull-up to 3V3) |
| `GPIO21` | `SDA` | I²C data — ADXL345 / BME280 / SCD41 |
| `GPIO22` | `SCL` | I²C clock |
| `GPIO34` | `IO34` | Battery divider midpoint (ADC1, input-only — fine, we only read it) |
| `GPIO25` | `IO25` | Divider enable — **only if you fit the gating transistors; see below** |

Battery divider: cell+ → 100kΩ → **GPIO34** → 100kΩ → GND. At 4.2V that puts
2.10V on the pin, comfortably inside ADC1's range, and it matches the
firmware's `* 2.0` exactly. No change needed.

### Skip the Q1/Q2 gating on the prototype

The PCB design gates the divider with a PMOS+NPN pair so it draws nothing in
sleep. On a breadboard, don't bother: a permanently-connected 200kΩ divider
draws ~21µA, which is irrelevant next to this board's own sleep current (see
below). Wire the divider straight to GND. The firmware still toggles GPIO25
and waits 30ms before reading — harmless with a permanent divider, and it
means the same sketch runs on both the prototype and the real board.

### Powering it

Cell → TP4056 `B+`/`B-`. TP4056 `OUT+` → the board's **`5V` pin** (not `3V3`).

**Never feed the cell into the `3V3` pin.** A charged cell is 4.2V and the
ESP32's absolute maximum is 3.6V — that kills the chip. The `5V` pin routes
through the board's own regulator, which is what you want.

The cost is headroom: an ME6211-class LDO drops ~0.1–0.3V under WiFi load, so
the rig browns out at roughly a 3.4–3.6V cell — you get the top 70–80% of
capacity. Fine for bench work, and one of several reasons prototype runtime
is not product runtime.

**Charge through the TP4056's own USB port.** Don't plug the D1 Mini's USB in
at the same time as the battery: both feed the `5V` rail and will fight.
For flashing, disconnect the battery first.

---

## Module A — Temperature (the Hub)

| Part | Qty | Cost |
|---|---|---|
| DS18B20 waterproof probe (cabled) | 1 | $2–3 |
| 4.7kΩ resistor | 1 | ~$0.01 |

Probe: red→3V3, black→GND, yellow→GPIO4, with the 4.7kΩ between GPIO4 and
3V3. Some probe modules have the pull-up fitted — check before adding a
second one.

Flash `firmware/fermentation_monitor_v1/`. **Module total: ~$2–3.**

> DS18B20 counterfeits are widespread and show up as noisy readings, wrong
> resolution, or CRC failures. If temperatures look erratic, suspect the
> sensor before the code.

---

## Module B — Humidity add-on (Hub)

| Part | Qty | Cost |
|---|---|---|
| BME280 breakout (GY-BME280) | 1 | $2–4 |

I²C to SDA/SCL. **Module total: ~$2–4.**

> **Check you got a BME280, not a BMP280.** They look identical, share a
> footprint, and are routinely mislabelled by budget sellers — but the BMP280
> has **no humidity sensor**, which is the entire point here. A BME280 at
> address 0x76/0x77 returns chip ID `0x60`; a BMP280 returns `0x58`.

Firmware: not written yet — `fermentation_monitor_v1.ino` doesn't call
`Wire.begin()`. Small addition.

---

## Module C — Temp + Gravity (the float) — build this one first

| Part | Qty | Cost |
|---|---|---|
| ADXL345 breakout (GY-291) | 1 | $2–3 |
| DS18B20 — probe for bench work, bare TO-92 for potting later | 1 | $1–3 |
| 4.7kΩ resistor | 1 | ~$0.01 |

ADXL345 → SDA/SCL, VCC→3V3, GND→GND. **Module total: ~$3–6.**

> **Check the I²C address.** The firmware expects **0x53**, which the ADXL345
> reports when `SDO` is tied **low**. Many GY-291 boards float or pull `SDO`
> high, giving **0x1D** instead. If the sketch reports no usable samples,
> that's the first thing to check — tie `SDO` to GND, or change
> `ADXL345_ADDR` in the sketch.

**You do not need a housing to answer the axis question.** Hold the board
upright and confirm the sketch prints a tilt near 0°; lay it flat and confirm
near 90°. If it's inverted or pinned near 90°, change which of x/y/z
`readTiltDegrees()` treats as the long axis. That is calibration step 1, and
it takes five minutes on the bench.

For the gravity sweep you *do* need a float: seal the rig in a candidate
housing with ballast and float it in sugar solutions of known gravity. That
answers whether the angle moves usefully — the question nothing else can.

---

## Module D — CO₂ Safety Module

| Part | Qty | Cost |
|---|---|---|
| SCD41 breakout (Sensirion) | 1 | **$25–40** |
| Active buzzer module | 1 | $1–2 |

I²C to SDA/SCL; buzzer to any free GPIO. **Module total: ~$26–42.**

> The SCD41 is by far the most expensive part in this whole project — more
> than the entire float BOM. Build this module last, and only if CO₂ safety
> monitoring is something you actually intend to sell. A cheap MQ-135 is
> *not* a substitute: it's a non-specific gas sensor, not an NDIR CO₂ meter,
> and would produce confident nonsense in a safety device.

Firmware: not written. Schema support for `device_type = 'co2'` exists but
nothing writes to it.

---

## What this rig will and won't tell you

**It will answer**, honestly and cheaply: the tilt axis; whether the float
angle sweeps usefully across the gravity range; whether the calibration
polynomial fits real data; whether the temperature correction behaves; and
whether WiFi actually reaches your fermenter, in your vessel, from your
router.

**It will not tell you about battery life.** The D1 Mini ESP32 keeps its
CH340C USB-serial chip and regulator powered in deep sleep, so board-level
sleep current sits in the **milliamp** range rather than the bare module's
~20µA. On the same 18650:

| Sleep current | Runtime |
|---|---|
| ~20µA (bare module, the PCB design) | ~5 months |
| ~500µA (dev board, optimistic) | ~12 weeks |
| ~1.5mA (dev board, typical) | ~6 weeks |
| ~3mA (dev board, pessimistic) | ~4 weeks |

Add the LDO headroom loss above and prototype runtime could be **an order of
magnitude** short of the product figure. That is a property of the dev board,
not of the design — don't read it as a failure, and don't quote it as the
product spec either.

**It also won't tell you about waterproofing or pressure**, both of which are
housing properties, and the housing is still the largest unknown in the
project.

---

## Cost to answer the open questions

| | Cost |
|---|---|
| Base rig (you own the board) | $5–11 |
| Module C — Temp + Gravity | $3–6 |
| **Total to validate the tilt axis and calibration** | **~$8–17** |

Roughly one tenth of a single finished unit, and it retires the two risks
that currently make every other number in this repo provisional.
