# Design Risks — Temp + Gravity Module

## Power integrity

- **Q1/Q2 gate-drive polarity is safety-critical, not stylistic.** A
  direct GPIO→PMOS-gate connection cannot guarantee the divider is fully
  off against a freshly-charged cell (V_GS lands around -0.9V on a
  4.2V cell against AO3401A's 900mV threshold — inside the ambiguous
  region, not solidly off). The SKiDL coder must wire Q2 (NPN, low-side)
  between the GPIO and Q1's gate exactly as specified in `net_plan.md`,
  not simplify it to a direct connection. **ERC will not catch this** —
  it's a topology requirement, not an electrical-rule violation. Flag for
  manual review at `design-review` stage.
- **LDO must stay low-Iq.** XC6206P332MR-G (Iq 1µA, confirmed via
  datasheet spec) is correct; an AMS1117-class substitution during
  sourcing (e.g. if C5446 goes out of stock) would silently defeat the
  deep-sleep battery-life target. Part-sourcer should not auto-substitute
  this part without flagging the Iq spec explicitly.
- **USB-C CC1/CC2 pull-downs (R11/R12) are functionally required, not
  optional bench convenience.** Missing them means the board only charges
  from cables that carry their own pull-up (legacy USB-A→C), and silently
  fails with a modern C-to-C charger — a field failure that won't show up
  on the bench. `BOM_TEMP_GRAVITY.md` already documents this as the #1
  correction from an earlier BOM revision; don't regress it.
- **R9 (TP4056 PROG, 1.2kΩ) is cell-capacity-dependent.** Sized for a
  2500mAh 18650 at ~1A/0.40C. If the part-sourcer or a later revision
  substitutes a different cell capacity, R9 must be re-sized (see the
  table in `hardware/BOM_TEMP_GRAVITY.md`) or the cell will be
  overcharged.

## Thermal

- **MCP9808 (U7) placement dominates its datasheet accuracy.** A ±0.25°C
  part reading still internal air is worse than a ±0.5°C part bonded to
  the housing wall. Layout must keep U7 physically isolated (copper
  relief) from the ESP32 module and LDO — both are heat sources relative
  to the ambient the sensor is meant to measure — and route it toward the
  housing wall side of the board.
- If a given housing makes thermal bonding impractical, the DS18B20
  fallback path (R3 + GPIO4, conditionally populated) is the documented
  escape hatch — firmware auto-detects which sensor is present.

## Layout / EMC

- **ESP32 antenna keep-out (15×15mm, all layers) is a hard constraint**
  inherited from the Hub design, and is *tighter* here than on the Hub
  because this board fits inside a 37mm-diameter tube rather than a
  general enclosure. Confirm the module's antenna edge can actually reach
  a board edge with full keep-out inside that diameter before finalizing
  board outline — this is a real risk specific to this form factor that
  the Hub board didn't have to solve.
- 2-layer PCB (reused decision from PCB_DESIGN.md) — solid bottom GND
  pour, broken only at the antenna keep-out, stitched to top GND with
  vias along board edges. Adequate at this batch size (15-25 units); the
  4-layer cost delta doesn't amortize until ~100+ units.
- Power section (TP4056, DW01A, FS8205, LDO) should cluster near the
  USB-C and cell connectors, physically separated from the I2C sensor bus
  and MCU — keeps switching/charge noise off the I2C lines and away from
  the WiFi radio.

## Sourcing / BOM integrity

- **Q2's BOM reference (`hardware/BOM_TEMP_GRAVITY.md` R-row for Q2 lists
  LCSC C8598) resolves to a Schottky diode, not an MMBT3904 NPN
  transistor.** Corrected in `skeleton_bom.md` to C20526. This would have
  produced a broken netlist (wrong pin count/function) had it reached the
  SKiDL coder unchecked — the part-sourcer should treat any further
  LCSC# reuse from the existing hardware docs with the same live-verify
  skepticism rather than trusting them as pre-cleared.
- **Six of eleven active parts are single-source** (ESP32-WROOM module,
  ADXL345, MCP9808 — each a proprietary IC from one manufacturer with no
  pin-compatible second source). Acceptable at 15-25 unit batch size;
  worth revisiting if the batch size grows and lead-time risk becomes
  material.
- MCP9808 (C129490) stock (897 units) is the thinnest margin of any part
  on this board relative to the >500-unit warning threshold. Re-check at
  order time, especially if the batch size increases.

## Timing / firmware coupling

- All GPIO assignments (4, 21, 22, 25, 34) are fixed by
  `firmware/fermentation_tilt_v1/` and must not be reassigned without a
  firmware change — flagged in `net_plan.md`, repeated here since it's
  the single easiest mistake for a coder to make while "cleaning up" pin
  numbering.
- The battery-ADC settling delay (30ms in firmware) is sized for C9
  (0.1µF filter cap) — changing that cap value without a firmware review
  could under- or over-settle the reading.

## Out of scope for this document (tracked, not blocking)

- Tilt-axis assumption (which physical ADXL345 axis runs along the
  housing) — unvalidated on hardware, resolved by the bench calibration
  procedure in `PROTOTYPE_TEMP_GRAVITY.md`, not by this board's design.
- Housing waterproofing under sustained submersion — a housing/mechanical
  risk, not a PCB risk.
