# Temp + Gravity Module — Complete Parts List

Everything needed to build one floating unit that reports **temperature and
specific gravity**. Schematic: [`schematic-gravity-module.html`](schematic-gravity-module.html).
Firmware: `firmware/fermentation_tilt_v1/`.

Also published as a checkable order list:
<https://claude.ai/code/artifact/30287fa3-41c6-4aa6-bf64-7ca5688c4331>

Costs are single-unit estimates in USD. ZAR figures use the ~25% landed
markup convention from `docs/IMPLEMENTATION_PLAN.md` (shipping + customs on
imported electronics), not the raw FX rate.

> **Three corrections are folded into this list** — see
> [What changed from the earlier BOM](#what-changed-from-the-earlier-bom).
> The most important: the USB-C CC resistors were missing, and without them
> the unit will not charge from a USB-C charger at all.

---

## 1. On-board electronics

### Active parts

| Ref | Part | Package | Qty | Source | Unit cost | Notes |
|---|---|---|---|---|---|---|
| U1 | ESP32-WROOM-32E (not S3/C3) | Module | 1 | LCSC C701343 | ~$2.20 | Classic ESP32 keeps the GPIO4/GPIO21/GPIO22/GPIO34 mapping the firmware assumes |
| U2 | TP4056 (bare IC) | SOP-8 | 1 | LCSC C382139 | ~$0.10 | Charge controller |
| U3 | DW01A | SOT-23-6 | 1 | LCSC (search DW01A) | ~$0.05 | Over-discharge/over-current protection — **not** included in a bare TP4056 |
| U4 | FS8205A | SOT-23-6 | 1 | LCSC (search FS8205A) | ~$0.08 | Dual MOSFET pair driven by U3 |
| U5 | XC6206P332MR (3.3V LDO) | SOT-23-3 | 1 | LCSC C5446 | ~$0.03 | **Not AMS1117** — quiescent current must stay in single-digit µA or deep sleep is pointless |
| U6 | ADXL345 | LGA-14 | 1 | LCSC (search ADXL345BCCZ) | ~$1.80 | Tilt sensing. I²C mode: SDO→GND (addr 0x53), CS→3V3 |
| Q1 | AO3401 PMOS | SOT-23 | 1 | LCSC C15127 | ~$0.02 | Gates the battery divider so it draws nothing in sleep |
| Q2 | MMBT3904 NPN | SOT-23 | 1 | LCSC C8598 | ~$0.02 | Low-side switch for Q1's gate — a GPIO **cannot** drive the PMOS gate directly, see `PCB_DESIGN.md` |
| D1 | LED, red | 0603 | 1 | — | ~$0.02 | TP4056 CHRG. Optional, but the only charge feedback on a sealed unit |
| D2 | LED, green | 0603 | 1 | — | ~$0.02 | TP4056 STDBY (charge complete) |

**Subtotal: ~$4.34**

### Resistors (all 0603)

| Ref | Value | Qty | Purpose |
|---|---|---|---|
| R1, R2 | 100kΩ **1%** | 2 | Battery divider. 1% matters — the firmware assumes an exact 1:1 ratio |
| R3 | 4.7kΩ | 1 | DS18B20 1-Wire pull-up |
| R4 | 10kΩ | 1 | EN pull-up |
| R5 | 10kΩ | 1 | IO0 pull-up |
| R6 | 100kΩ | 1 | Q1 gate pull-up to BAT+ — this, not the GPIO, defines the solidly-off state |
| R7, R8 | 4.7kΩ | 2 | I²C pull-ups (SDA/SCL to the ADXL345) |
| R9 | 1.2kΩ | 1 | TP4056 PROG — sets ~1A charge current. **See the charge-rate warning below** |
| R10 | 10kΩ | 1 | Q2 base resistor |
| R11, R12 | 5.1kΩ **1%** | 2 | **USB-C CC1/CC2 pull-downs — required, see below** |
| R13, R14 | 2kΩ | 2 | D1/D2 LED current limit |

**14 resistors, ~$0.14 total**

### Capacitors

| Ref | Value | Package | Qty | Purpose |
|---|---|---|---|---|
| C1 | 1µF | 0603 | 1 | EN RC delay (with R4) |
| C2, C3 | 0.1µF | 0603 | 2 | ESP32 module VDD decoupling |
| C4 | 22µF | 0805 | 1 | 3V3 bulk. WiFi TX pulls 250–500mA in bursts that an LDO alone won't follow |
| C5 | 10µF | 0805 | 1 | TP4056 VIN |
| C6 | 10µF | 0805 | 1 | TP4056 BAT |
| C7 | 1µF | 0603 | 1 | LDO input |
| C8 | 1µF | 0603 | 1 | LDO output |
| C9 | 0.1µF | 0603 | 1 | Battery-ADC node filter (the 30ms settling delay in firmware is sized for this cap) |
| C10 | 0.1µF | 0603 | 1 | ADXL345 VDD I/O decoupling |
| C11 | 1µF | 0603 | 1 | ADXL345 VS — the datasheet asks for 1µF here, not 0.1µF |

**11 capacitors, ~$0.28 total**

### Connectors and mechanical (board-mounted)

| Ref | Part | Qty | Unit cost | Notes |
|---|---|---|---|---|
| J1 | USB-C 16-pin receptacle, power-only | 1 | ~$0.15 | LCSC C165948. **Mounts on the top cap, above the waterline** |
| J3 | JST-PH 2-pin | 1 | ~$0.08 | Cell leads. Omit and solder directly if the housing is tight |
| J4 | 2.54mm 6-pin header | 1 | ~$0.05 | Assembly-time programming only — not populated in the field |
| SW1 | Tactile button | 1 | ~$0.03 | IO0 boot-mode select. Optional if you program via J4 |

**No J2.** The Hub has a JST probe connector; this board deliberately has
none. The whole unit is submerged, and an external probe would mean a cable
penetration through the housing — one more seal to fail.

**On-board parts subtotal: ~$5.07.** In practice you don't buy these
individually: budget **$6–8/unit (R165–R220)** for PCB fab + SMT assembly
with all of the above populated, at 15–25 unit quantity.

---

## 2. Off-board parts

| Part | Qty | Unit cost | Notes |
|---|---|---|---|
| DS18B20, **bare TO-92** | 1 | $1–2 | Not the cabled waterproof probe — this one is potted against the inside of the housing wall |
| Slim Li-ion cell (10440, or LiPo pouch) | 1 | $1.50–3 | **Choose the housing first.** Capacity is constrained by tube diameter, not the other way round |
| Sealed floating housing (tube + top cap) | 1 | $3–6 | The real cost and schedule risk. See below |
| Ballast — lead-free shot, stainless nuts, or tungsten putty | ~10–30g | $0.30–1 | **Required.** Sets the float angle; without it the unit floats flat and reads nothing useful |
| Thermal epoxy / potting compound | ~2g | $0.50–1 | Bonds the DS18B20 to the housing wall. Thermally conductive, electrically insulating |
| O-ring or silicone gasket for the cap | 1 | $0.10–0.30 | Size to the housing |
| Desiccant sachet (silica gel) | 1 | $0.05–0.15 | Stops internal condensation as the unit cycles between fermenter and room temperature |
| Closed-cell foam spacer / double-sided tape | 1 | $0.10–0.20 | Stops the pack shifting, which would change the float angle mid-batch |
| USB-C port plug | 1 | $0.10–0.30 | Keeps wort out of the connector while submerged |

**Off-board subtotal: ~$6.65–14.  Optional:** silicone conformal coating on
the assembled board (~$0.20/unit amortized) — cheap insurance in a device
whose failure mode is water ingress.

---

## 3. Totals

| | USD | ZAR (landed) |
|---|---|---|
| PCB fab + SMT assembly (all on-board parts) | $6–8 | R165–R220 |
| Off-board parts | $6.65–14 | R180–R385 |
| **Per unit** | **~$13–22** | **~R360–R600** |

For a 15–25 unit batch: roughly **R5,400–R15,000**. Order and leak-test
housings *before* committing to a PCB run — the board is proven
architecture reused from the Hub, the housing is not.

---

## What changed from the earlier BOM

The table in `MULTI_SENSOR_MODULES.md` and the schematic disagreed with each
other. Reconciling them for this list turned up three things:

**1. The USB-C CC resistors were missing entirely — this one is functional.**
A USB-C receptacle acting as a *sink* must present 5.1kΩ from CC1 and CC2 to
ground. A USB-C charger detects those pull-downs before it enables VBUS; with
no Rd present it supplies nothing and the unit never charges. The trap is
that it appears to work on the bench, because a legacy USB-A→C cable carries
its own pull-up in the cable assembly and delivers VBUS regardless. So the
fault shows up only when a customer uses a modern C-to-C charger. The Hub's
`PCB_DESIGN.md` had it right in the DFM checklist but called the resistors
"optional" in the BOM line for J1, and neither BOM listed them as parts.
Added here as R11/R12.

**2. R7 and R8 were used twice in the schematic** — once as the 5.1k CC
pull-downs and again as the 4.7k I²C pull-ups. Two different parts sharing a
reference designator produces a broken netlist and a wrong pick-and-place
file. Renumbered: R7/R8 are the I²C pull-ups, R11/R12 are the CC resistors.

**3. The capacitor list didn't match the schematic.** The BOM called C5/C6
the TP4056 input/output caps, but the schematic drew them as the LDO's input
and output caps, leaving the TP4056 with none and no bulk cap on 3V3. Both
sets are needed, so they're separated here (C5/C6 for the TP4056, C7/C8 for
the LDO, C4 for 3V3 bulk), and ADXL345 decoupling is split into C10/C11 to
match its datasheet.

Also added, because none of it was previously listed and you cannot build a
working floating hydrometer without it: **ballast, potting compound, cap
gasket, desiccant, foam spacer, and a port plug.**

---

## Before you order

**Check the charge current against the cell you picked.** R9 = 1.2kΩ sets
the TP4056 to roughly 1A. That suits an 18650. A 10440 or a small LiPo pouch
is typically 320–800mAh, and 1A may exceed its 0.5–1C safe charge rate.
Size R9 to the cell you actually chose: I_charge ≈ 1200 / R_prog (amps, ohms).
For a 350mAh 10440 at 0.5C (175mA), R9 ≈ 6.8kΩ.

**The housing decides several other parts.** Diameter sets which cell fits;
length and total mass set how much ballast you need; the cap sets the
gasket. Don't order cells or ballast before you have a housing in hand.

**Two things remain unvalidated on hardware**, both flagged in
`MULTI_SENSOR_MODULES.md`:

- **The tilt axis assumption** — which physical accelerometer axis runs
  along the housing. It's step 1 of the calibration procedure in
  `firmware/README.md` precisely because it's a guess until measured.
- **Housing waterproofing.** A leak destroys the unit *and* the batch it's
  floating in. Leak-test a housing, weighted and sealed, in water at
  fermentation temperature for several days before trusting one to a batch.

None of this has been built or tested physically — it is a design on paper,
reusing a power section that is itself validated only on the Hub's schematic.
