# Fermentation Monitor — Multi-Sensor Module Line

Extends the single-board design in `PCB_DESIGN.md` to cover humidity,
gravity/density, and CO₂. The four sensors don't belong on one board —
each has a physical placement constraint that decides its form factor
before any schematic gets drawn:

| Sensor | Where it physically has to live | Consequence |
|---|---|---|
| Temperature | In the liquid | Either the **Hub**'s external probe, *or* the **Temp + Gravity Module** below — pick one, not both, if you want both readings |
| Humidity | Headspace/ambient air near the vessel | Cheap add-on to the **Hub** (I²C, same board) |
| Gravity/density | Floating *inside* the liquid, sealed | Its own device — the **Temp + Gravity Module** |
| CO₂ | Ambient room air, away from the vessel | Its own device — the **CO₂ Safety Module** |

**If you want both temperature and gravity**: don't build a Hub *and* a
gravity device — the gravity device already needs a temperature sensor
on board (to compensate the tilt→SG curve), and that reading is just as
usable as the Hub's. One floating unit covers both. The Hub is still its
own product for temp-only (cheaper, no accelerometer) or for humidity.

## Why gravity/density can't just be "a sensor on the hub"

There's no electronic sensor that reads specific gravity directly and
cheaply. The standard hobbyist approach — used by both the commercial
Tilt Hydrometer and iSpindel — is a sealed body that **floats** in the
fermenting liquid and infers SG from the *angle it floats at*: as
fermentation converts sugar to alcohol, density drops, and the weighted
body tips to a different angle. An accelerometer measures that tilt angle;
a calibration curve (built from a few reference-gravity readings during
setup) converts angle → SG. This only works if the whole electronics
package is sealed inside something that floats — it cannot be the same
physical unit as the Hub, which sits outside the fermenter.

That floating package already needs its own temperature sensor (to
compensate the tilt curve — tilt angle vs. SG shifts with temperature),
and there's no reason to treat that reading as internal-only: it's posted
as a normal, independent temperature value. So for anyone who wants both
temperature and gravity, the answer isn't "Hub + gravity device" — it's
just the one floating unit, renamed accordingly below.

## Why CO₂ can't just be "a sensor in the airlock"

The intuitive placement — inside the sealed headspace, reading fermentation
off-gas — doesn't work with any sensor a hobbyist product can afford.
Active fermentation headspace runs close to 100% CO₂ (~1,000,000 ppm);
every consumer NDIR sensor (the SCD41 used here included) saturates well
below that, most below 40,000 ppm. Reading fermentation *rate* from CO₂ is
also redundant with the Temp + Gravity Module's gravity curve, which
measures the same thing far more precisely.

What CO₂ monitoring is actually good for here is **safety**: fermentation
off-gas building up in an enclosed, poorly-ventilated room (a cellar,
closet, or small brewery) is a real, documented asphyxiation hazard in
homebrewing communities — "cellar gas" incidents are a known risk, not a
hypothetical. So the CO₂ Safety Module is placed in the **room**, not the
vessel, and is designed to alarm locally (buzzer), not just log to a
dashboard someone might not be watching.

---

## Module 1: Humidity/Pressure add-on (Hub board)

Adds a Bosch BME280 (temperature + humidity + pressure, one I²C chip,
already-integrated compensation) to the existing Hub board from
`PCB_DESIGN.md`. See `schematic.html` for the added section — it taps two
previously-unused ESP32 pins (`GPIO21`/`GPIO22`, the ESP32 Arduino core's
default I²C pins) and needs no changes to the existing DS18B20/battery/
power circuitry.

| Ref | Part | Package | Qty | Est. cost | Notes |
|---|---|---|---|---|---|
| U7 | BME280 | LGA-8 | 1 | ~$2.00 | I²C mode: CSB tied to 3V3, SDO tied to GND (address 0x76) |
| R15,R16 | 4.7kΩ | 0603 | 2 | ~$0.01 ea | Fresh I²C pull-ups — this bus has nothing else on it yet |
| C9 | 0.1µF | 0603 | 1 | ~$0.02 | VDD decoupling |

**Placement**: mount the Hub where it reads headspace/ambient air, not
buried against the fermenter wall — a BME280 sealed inside an enclosure
with no airflow just reports the enclosure's own microclimate. Vent the
enclosure near the sensor.

**Firmware**: new — `fermentation_monitor_v1.ino` doesn't call `Wire.begin()`
or poll a BME280 yet. Small addition (I²C init + one read per wake cycle,
posted alongside the existing temperature/battery fields).

---

## Module 2: Temp + Gravity Module (new standalone device)

Full schematic: [`schematic-gravity-module.html`](schematic-gravity-module.html).

A sealed, floating body — same electrical architecture as the Hub (ESP32-
WROOM-32E, TP4056 charging, DW01A+FS8205 protection, low-Iq LDO, gated
battery divider — all reused verbatim from `PCB_DESIGN.md` since that
design is already validated) plus an ADXL345 accelerometer for tilt.

**This is the combined temp+gravity unit, not a gravity-only device.**
The DS18B20 it needs anyway (to compensate the tilt→SG curve) is posted
as its own independent reading — so a customer who wants both temperature
and gravity buys/builds *this one device*, not a Hub plus a separate
gravity sensor. The Hub remains the right choice for temp-only (cheaper,
no accelerometer) or when humidity is wanted instead.

### Key differences from the Hub, and why

- **DS18B20 is potted inside the housing, not on an external probe.** The
  whole module is already submerged — a cable penetration through the
  housing to an external probe would be a seal to fail. Glue/pot the
  sensor against the inside of the housing wall for thermal contact with
  the liquid instead.
- **USB-C sits on the top cap, above the waterline, like the Tilt
  Hydrometer and RAPT Pill do it.** The body floats with only this cap
  exposed; charge without opening the housing.
- **Battery format is constrained by tube diameter, not capacity.** Most
  floating housings are built from a test-tube-diameter vial (25-32mm) —
  a standard 18650 (18mm dia., but long) may or may not fit depending on
  housing length; a slim 10440 or a small LiPo pouch cell is the more
  common choice. Pick the cell *after* the housing is chosen, not before.
- **No off-board probe connector (J2) at all** — see the DS18B20 point
  above. One fewer sealed penetration than the Hub design.

### BOM

| Ref | Part | Package | Qty | Est. cost | Notes |
|---|---|---|---|---|---|
| U1 | ESP32-WROOM-32E | Module | 1 | ~$2.20 | Same module as the Hub — firmware/pin knowledge carries over |
| U2 | TP4056 | SOP-8 | 1 | ~$0.10 | |
| U3 | DW01A | SOT-23-6 | 1 | ~$0.05 | |
| U4 | FS8205A | SOT-23-6 | 1 | ~$0.08 | |
| U5 | XC6206P332MR | SOT-23-3 | 1 | ~$0.03 | Low-Iq LDO — same rationale as the Hub |
| U6 | ADXL345 | LGA-14 | 1 | ~$1.80 | I²C mode: SDO→GND (addr 0x53), CS→3V3 |
| Q1 | AO3401 PMOS | SOT-23 | 1 | ~$0.02 | Battery-divider gate |
| Q2 | MMBT3904 NPN | SOT-23 | 1 | ~$0.02 | Low-side switch for Q1 — see `PCB_DESIGN.md`'s DFM note, same fix applies here |
| R1,R2 | 100kΩ | 0603 | 2 | ~$0.01 ea | Battery divider |
| R3 | 4.7kΩ | 0603 | 1 | ~$0.01 | DS18B20 pull-up (potted sensor, same net) |
| R4,R5 | 10kΩ | 0603 | 2 | ~$0.01 ea | EN / IO0 pull-ups |
| R6 | 100kΩ | 0603 | 1 | ~$0.01 | Q1 gate pull-up to BAT+ |
| R7,R8 | 4.7kΩ | 0603 | 2 | ~$0.01 ea | I²C pull-ups (ADXL345) |
| R9 | 1.2kΩ | 0603 | 1 | ~$0.01 | TP4056 PROG (~1A charge) |
| R10 | 10kΩ | 0603 | 1 | ~$0.01 | Q2 base resistor |
| C1 | 1µF | 0603 | 1 | ~$0.02 | EN RC delay |
| C2,C3 | 0.1µF | 0603 | 2 | ~$0.02 ea | Module VDD decoupling |
| C4 | 10µF | 0805 | 1 | ~$0.03 | 3V3 bulk |
| C5,C6 | 10µF | 0805 | 2 | ~$0.03 ea | TP4056 in/out |
| C7 | 0.1µF | 0603 | 1 | ~$0.02 | Battery-ADC node filter |
| C8 | 0.1µF | 0603 | 1 | ~$0.02 | ADXL345 decoupling |
| J1 | USB-C 16-pin | SMD | 1 | ~$0.15 | Top-mounted, above waterline |
| J4 | 2.54mm 6-pin header | THT | 1 | ~$0.05 | Assembly-time programming only |
| — | Slim Li-ion cell (10440 or LiPo pouch) | — | 1 | ~$1.50-3 | Pick after housing diameter is fixed |
| — | Sealed floating housing | — | 1 | ~$3-6 | The real unknown cost — mechanical, not electrical |

> **The table above is the board-level sketch, not the order list.** The
> complete, reconciled parts list — including the USB-C CC resistors that
> were missing here, a fix for the duplicated R7/R8 designators, corrected
> capacitors, and the mechanical parts (ballast, potting, gasket, desiccant)
> — is in [`BOM_TEMP_GRAVITY.md`](BOM_TEMP_GRAVITY.md). Order from that one.

**Estimated electronics BOM**: ~$6-8/unit, comparable to the Hub. Housing
is the wildcard — a 3D-printed or repurposed-vial housing needs its own
waterproofing validation (this is exactly the kind of thing the original
implementation plan flagged as "most likely to eat unexpected time").

### GPIO map (new firmware — does not reuse `fermentation_monitor_v1.ino`)

| Pin | Net |
|---|---|
| `GPIO4` | DS18B20 (potted — this module's primary temperature reading) |
| `GPIO21` / `GPIO22` | I²C (ADXL345) |
| `GPIO34` | Battery ADC |
| `GPIO25` | Battery-divider enable (same Q1/Q2 pattern as the Hub) |
| `EN` / `IO0` | Standard ESP32 boot circuit |

### Firmware — written

`firmware/fermentation_tilt_v1/fermentation_tilt_v1.ino`, with setup and
calibration instructions in `firmware/README.md`.

- Reads accelerometer X/Y/Z each wake, averages a burst of samples,
  computes the tilt angle, and posts `{temperature_c, tilt_deg,
  battery_v}` — **not** a gravity value directly.
- SG is computed on read by the `readings_with_gravity` view from
  per-device calibration coefficients (`SG = a·tilt³ + b·tilt² + c·tilt + d`)
  stored on the `devices` row. Keeping raw tilt in the table means
  recalibrating a device fixes its whole history rather than leaving wrong
  values baked into stored rows.
- Schema support is applied:
  `supabase/migrations/20260912100000_tilt_gravity_support.sql` adds
  `readings.tilt_deg`, `devices.device_type`, the calibration columns, the
  extra `ingest_reading` parameter, and the gravity view.
- **Still untested on hardware** — in particular the tilt axis assumption
  (which physical axis runs along the housing) is unverified, and it's
  step 1 of the calibration procedure for exactly that reason.

---

## Module 3: CO₂ Safety Module (new standalone device)

Full schematic: [`schematic-co2-module.html`](schematic-co2-module.html).

Same power architecture as the Hub again, plus a Sensirion SCD41
(photoacoustic NDIR CO₂ sensor, integrated temp+humidity compensation) and
a local piezo buzzer — because a safety device that only alarms on a
dashboard someone isn't looking at has already failed at its one job.

### Key decisions

- **SCD41, not a cheap MQ-135.** MQ-135-class sensors are unspecific gas/
  VOC sensors, not calibrated CO₂ sensors — a common hobbyist mistake for
  exactly this use case. The SCD41 is a real NDIR sensor with a spec'd
  accuracy range (400-5000 ppm, the range that matters for an early-
  warning ambient monitor); it also outputs temperature and humidity for
  free, so this module doesn't need a separate BME280.
- **Local alarm, not just cloud alerting.** A GPIO-driven piezo buzzer
  (same NPN driver topology as any standard buzzer circuit) fires
  independent of WiFi/Supabase availability — the one thing that must not
  depend on the network for a safety function.
- **Placement is the room, not the vessel** — see the rationale above.
  Silkscreen/enclosure labeling should say this explicitly so it doesn't
  get zip-tied to an airlock by mistake.
- **Duty-cycle the sensor, don't run it continuously.** The SCD41 draws
  meaningfully more current per measurement than a DS18B20 read. Use its
  low-power single-shot mode and a sensible interval (every 2-5 minutes is
  plenty for a slow-building hazard) rather than continuous periodic
  mode — this is the primary lever for battery life on this module, more
  so than the battery-divider gating trick used elsewhere.
- **This module is a reasonable candidate for continuous USB power**
  instead of battery, if it's going to live on a shelf near an outlet
  anyway — flagging as a legitimate option rather than forcing the
  battery architecture on a device that doesn't need to be portable.

### BOM

| Ref | Part | Package | Qty | Est. cost | Notes |
|---|---|---|---|---|---|
| U1 | ESP32-WROOM-32E | Module | 1 | ~$2.20 | |
| U2 | TP4056 | SOP-8 | 1 | ~$0.10 | Omit U2-U5 + J1 entirely if running USB-powered only |
| U3 | DW01A | SOT-23-6 | 1 | ~$0.05 | |
| U4 | FS8205A | SOT-23-6 | 1 | ~$0.08 | |
| U5 | XC6206P332MR | SOT-23-3 | 1 | ~$0.03 | |
| U6 | SCD41 | SMD sensor module | 1 | ~$11 | I²C mode: SEL pin tied to GND |
| Q1 | AO3401 PMOS | SOT-23 | 1 | ~$0.02 | Battery-divider gate |
| Q2 | MMBT3904 NPN | SOT-23 | 1 | ~$0.02 | Low-side switch for Q1 |
| Q3 | MMBT3904 NPN | SOT-23 | 1 | ~$0.02 | Buzzer driver |
| R1,R2 | 100kΩ | 0603 | 2 | ~$0.01 ea | Battery divider |
| R4,R5 | 10kΩ | 0603 | 2 | ~$0.01 ea | EN / IO0 pull-ups |
| R6 | 100kΩ | 0603 | 1 | ~$0.01 | Q1 gate pull-up |
| R7,R8 | 4.7kΩ | 0603 | 2 | ~$0.01 ea | I²C pull-ups (SCD41) |
| R9 | 1.2kΩ | 0603 | 1 | ~$0.01 | TP4056 PROG |
| R10 | 10kΩ | 0603 | 1 | ~$0.01 | Q2 base resistor |
| R11 | 1kΩ | 0603 | 1 | ~$0.01 | Q3 (buzzer) base resistor |
| R17 | 10kΩ | 0603 | 1 | ~$0.01 | Q3 base anti-float pull-down |
| D3 | 1N4148 | SOD-123 | 1 | ~$0.01 | Buzzer flyback diode |
| C1 | 1µF | 0603 | 1 | ~$0.02 | EN RC delay |
| C2,C3 | 0.1µF | 0603 | 2 | ~$0.02 ea | Module VDD decoupling |
| C4 | 10µF | 0805 | 1 | ~$0.03 | 3V3 bulk |
| C5,C6 | 10µF | 0805 | 2 | ~$0.03 ea | TP4056 in/out |
| C7 | 0.1µF | 0603 | 1 | ~$0.02 | Battery-ADC node filter |
| C10 | 0.1µF | 0603 | 1 | ~$0.02 | SCD41 decoupling |
| J1 | USB-C 16-pin | SMD | 1 | ~$0.15 | Charging, or primary power if battery omitted |
| J4 | 2.54mm 6-pin header | THT | 1 | ~$0.05 | |
| BZ1 | Piezo buzzer | THT/SMD | 1 | ~$0.20 | Local safety alarm |
| — | 18650 Li-ion cell + holder | THT | 1 | ~$2-4 | Omit if running USB-powered |

**Estimated BOM**: ~$14-16/unit battery-powered (dominated by the SCD41),
~$11-13/unit if built USB-only. This is meaningfully pricier than the
Hub or Temp + Gravity Module — the CO₂ sensor alone is roughly 5x the
Hub's entire electronics cost. Worth pricing this as a distinct,
higher-margin SKU rather than bundling it into a base kit.

### GPIO map (new firmware)

| Pin | Net |
|---|---|
| `GPIO21` / `GPIO22` | I²C (SCD41) |
| `GPIO34` | Battery ADC |
| `GPIO25` | Battery-divider enable |
| `GPIO26` | Buzzer driver (Q3 base, via R11) |
| `EN` / `IO0` | Standard ESP32 boot circuit |

### Firmware notes (not yet written)

- Fire the buzzer **in firmware, on-device, at a hardcoded fail-safe
  threshold** (e.g. 5000 ppm) independent of any cloud round-trip — the
  dashboard-configurable threshold pattern used for temperature
  (`get_device_config`) is fine as a *secondary*, adjustable warning
  level, but the hardcoded local one is what makes this a safety device
  rather than a datalogger with an opinion.
- Needs a new Supabase device type / readings shape (`co2_ppm`,
  `humidity_pct` alongside `temperature_c`) — same caveat as the Temp +
  Gravity Module: schema/dashboard work is out of scope for this hardware pass.

---

## What's shared vs. new across the whole product line

| | Hub | Temp + Gravity Module | CO₂ Module |
|---|---|---|---|
| MCU | ESP32-WROOM-32E | same | same |
| Power architecture (TP4056+protection+LDO+gated divider) | ✓ (validated) | reused as-is | reused as-is |
| Firmware | `fermentation_monitor_v1.ino` (exists) | `fermentation_tilt_v1.ino` (exists) | new sketch needed |
| Supabase schema | `devices`/`readings`/`alerts` (exists) | extended (tilt + calibration, applied) | needs extension |
| Dashboard view | exists | gravity chart + calibration form (exists) | needs a new view |

The hardware reuse is real and deliberate — the same validated power
section (including the Q1/Q2 gating fix from `PCB_DESIGN.md`) shows up on
all three boards rather than being re-derived each time.

Still outstanding: the CO₂ module's firmware and schema. The Temp +
Gravity Module is complete end to end — schematic, firmware, schema, and a
dashboard that charts its gravity and takes its calibration curve — with
the hardware validation caveats above (tilt axis, housing) still open.
