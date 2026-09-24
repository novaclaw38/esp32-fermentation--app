# SPEC.md — Temp + Gravity Module

Production SMD board for the floating fermentation temperature + specific
gravity sensor. Derived from `hardware/BOM_TEMP_GRAVITY.md`,
`hardware/PROTOTYPE_TEMP_GRAVITY.md`, and `hardware/schematic-gravity-module.html`
(the Hub's `hardware/PCB_DESIGN.md` documents the sibling board and shares
the same power section). Firmware: `firmware/fermentation_tilt_v1/`.

## Functional
- Floating unit that reports **temperature** and **specific gravity**
  (via tilt angle) from inside a sealed fermenter.
- MCU: ESP32-WROOM-32E (classic ESP32, not S3/C3 — firmware GPIO mapping
  depends on it).
- Tilt sensing: ADXL345 accelerometer, I2C address 0x53 (SDO→GND).
- Temperature: MCP9808 on-board (I2C address 0x18, A0/A1/A2→GND), thermally
  bonded to the housing wall. DS18B20 on two wires is a supported fallback
  if on-board thermal coupling isn't practical for a given housing — the
  firmware auto-detects which sensor is present.
- WiFi → HTTPS → Supabase, same ingest path as the Hub.
- Deep-sleep between readings; default interval 900s (15 min), configurable
  remotely. OTA update path already implemented in firmware.
- Reports gravity as raw tilt angle plus a per-device calibration curve
  (`SG = a·tilt³ + b·tilt² + c·tilt + d`) entered on the dashboard —
  calibration is a firmware/dashboard concern, not a board requirement.

## Power
- Cell: single 18650 Li-ion, ~2500mAh, sized to a 37mm-diameter housing.
- Charge: TP4056 (bare IC, SOP-8) + DW01A (over-discharge/over-current
  protection) + FS8205A (dual MOSFET pair) — do not substitute a bare
  TP4056-only module, it lacks protection.
- Charge current: ~1A (0.40C) via PROG resistor R9 = 1.2kΩ. Re-size R9 if
  the cell capacity changes (see BOM_TEMP_GRAVITY.md table).
- Regulation: XC6206P332MR 3.3V LDO — **low-Iq required (<5µA)**, not an
  AMS1117-class part; deep-sleep battery life depends on it.
- Battery sense: 100kΩ/100kΩ 1% divider (R1/R2) to GPIO34, gated by a PMOS
  (Q1, AO3401) switched by an NPN low-side switch (Q2, MMBT3904) — never
  drive the PMOS gate directly from a GPIO (see PCB_DESIGN.md DFM note for
  why: it can't guarantee full off against a freshly-charged cell).
- Charging input: USB-C, power-only, receptacle J1 mounted on the top cap
  above the waterline. Requires 5.1kΩ 1% CC1/CC2 pull-downs (R11/R12) —
  **not optional**, a USB-C charger will not enable VBUS without them.
- Target sleep current: ~20-30µA (bare module + gated divider). Estimated
  runtime at the 15-min default interval: ~5.3 months on a 2500mAh cell.

## Interface
- I2C bus (GPIO21 SDA / GPIO22 SCL) shared by ADXL345 and MCP9808, each
  with its own 4.7kΩ pull-up (R7/R8).
- Optional DS18B20 fallback: GPIO4 + 4.7kΩ pull-up (R3) — omit if MCP9808
  is fitted.
- EN: 10kΩ pull-up (R4) + 1µF RC delay (C1).
- IO0: 10kΩ pull-up (R5) + tactile button (SW1, optional if flashing via
  header only).
- Programming: 2.54mm 6-pin header (J4) — 3V3/GND/TX/RX/EN/IO0. No onboard
  USB-serial chip; flashed once at assembly via external dongle, OTA for
  every update after.
- **No off-board probe connector** — unlike the Hub, this unit is fully
  submerged, so there is deliberately no J2-equivalent cable penetration.
- Charge status: 2× LED (D1 red / D2 green) on TP4056 CHRG/STDBY, 2kΩ
  series each (R13/R14).

## Physical
- Sealed floating housing, ~37mm × 125mm (tube + top cap) — sized to fit
  an 18mm-diameter 18650 with clearance, matching the commercial
  precedent (KegLand RAPT Pill class).
- Ballast (20-50g: lead-free shot, stainless nuts, or tungsten putty)
  required to set the float angle — not optional, the unit floats flat
  and reads nothing useful without it.
- MCP9808 must sit against the housing wall with thermal gap filler /
  thermal epoxy; layout needs copper relief keeping U7 away from the ESP32
  module and the LDO.
- O-ring/silicone gasket on the cap, desiccant sachet inside, closed-cell
  foam spacer to stop the cell shifting (which would change float angle
  mid-batch), USB-C port plug to keep liquid out while submerged.
- 2-layer PCB (reused decision from the Hub — 15-25 unit batch doesn't
  amortize a 4-layer cost delta; revisit past ~100 units).
- ESP32 module antenna keep-out (15×15mm, all layers) must be respected —
  flagged as a layout risk given the housing's narrow diameter; confirm
  clearance during the architecture stage.
- Optional silicone conformal coating on the assembled board.

## Production
- Batch size: 15-25 units (Phase 2 pre-sold batch), same track as the Hub.
- Fab/assembly: JLCPCB-class fab, SMT assembly. Parts sourced via LCSC
  part numbers throughout (matches the `find-part` skill's JLCPCB-tier
  sourcing rules).
- Cost target: on-board parts ~$5.07/unit in components, ~$6-8/unit for
  PCB fab + SMT assembly at this quantity; off-board parts (housing,
  ballast, potting, gasket, desiccant, foam, port plug) ~$7.15-16.45/unit.
  **Total ~$13-25/unit landed (~R360-690).**
- Recommend ordering a small prototype run (2-5 units) before committing
  to the full batch, consistent with the Hub's precedent — the power
  section is shared/proven, the housing and thermal-coupling assumptions
  are not.
- Two assumptions remain unvalidated on real hardware and are out of
  scope for this board spec (tracked separately, not blocking): which
  accelerometer axis runs along the housing, and housing waterproofing
  under sustained submersion.
