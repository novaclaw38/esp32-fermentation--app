# Skeleton BOM — Temp + Gravity Module

Reconciles `hardware/BOM_TEMP_GRAVITY.md` with live-verified LCSC part
numbers from `ic_selection.md`. **R7/R8/R9/R10-R14 reference designators
below match the already-reconciled numbering in BOM_TEMP_GRAVITY.md**
(that doc's own "What changed from the earlier BOM" section already fixed
an R7/R8 double-use bug — this skeleton does not reintroduce it).

## Active parts

| Ref | Function | Suggested MPN | Package | Qty | Notes |
|---|---|---|---|---|---|
| U1 | MCU | ESP32-WROOM-32E-N16 | Module, 25.5×18mm | 1 | LCSC C701343. Classic ESP32 only (not S3/C3) |
| U2 | Li-ion charge controller | TP4056 | ESOP-8 | 1 | LCSC C382139 |
| U3 | Battery protection | DW01A | SOT-23-6L | 1 | LCSC C351410 — BOM had no LCSC# for this part |
| U4 | Dual protection MOSFET | FS8205A | SOT-23-6 | 1 | LCSC C2830320 — BOM had no LCSC# for this part |
| U5 | 3.3V LDO, low-Iq | XC6206P332MR-G | SOT-23-3 | 1 | LCSC C5446. **Not AMS1117-class** |
| U6 | Tilt sensor | ADXL345BCCZ-RL7 | LGA-14 | 1 | LCSC C9667. I2C mode: SDO→GND (0x53), CS→3V3 |
| U7 | Temperature sensor | MCP9808T-E/MS | MSOP-8 | 1 | LCSC C129490. A0/A1/A2→GND (0x18). Thermally bond to housing wall |
| Q1 | Battery-divider gate (PMOS) | AO3401A | SOT-23 | 1 | LCSC C15127 |
| Q2 | Q1 gate low-side switch (NPN) | MMBT3904 | SOT-23 | 1 | **LCSC C20526 — corrects BOM_TEMP_GRAVITY.md's C8598, which is actually a Schottky diode, not this transistor** |
| D1 | Charge LED (red) | 0603 red LED | 0603 | 1 | TP4056 CHRG indicator |
| D2 | Charge-complete LED (green) | 0603 green LED | 0603 | 1 | TP4056 STDBY indicator |

## Resistors (all 0603 unless noted)

| Ref | Value | Qty | Function |
|---|---|---|---|
| R1, R2 | 100kΩ 1% | 2 | Battery divider — 1% matters, firmware assumes exact 1:1 |
| R3 | 4.7kΩ | 1 (optional) | DS18B20 1-Wire pull-up — only if DS18B20 fallback populated instead of U7 |
| R4 | 10kΩ | 1 | EN pull-up |
| R5 | 10kΩ | 1 | IO0 pull-up |
| R6 | 100kΩ | 1 | Q1 gate pull-up to BAT+ (defines solidly-off state) |
| R7, R8 | 4.7kΩ | 2 | I2C SDA/SCL pull-ups |
| R9 | 1.2kΩ | 1 | TP4056 PROG — sets ~1A charge current for a 2500mAh cell. **Re-size if cell capacity changes** |
| R10 | 10kΩ | 1 | Q2 base resistor |
| R11, R12 | 5.1kΩ 1% | 2 | USB-C CC1/CC2 pull-downs — **not optional**, charger won't enable VBUS without them |
| R13, R14 | 2kΩ | 2 | D1/D2 LED current limit |

## Capacitors

| Ref | Value | Package | Qty | Function |
|---|---|---|---|---|
| C1 | 1µF | 0603 | 1 | EN RC delay |
| C2, C3 | 0.1µF | 0603 | 2 | ESP32 module VDD decoupling |
| C4 | 22µF | 0805 | 1 | 3V3 bulk — covers WiFi TX current bursts |
| C5 | 10µF | 0805 | 1 | TP4056 VIN |
| C6 | 10µF | 0805 | 1 | TP4056 BAT |
| C7 | 1µF | 0603 | 1 | LDO input |
| C8 | 1µF | 0603 | 1 | LDO output |
| C9 | 0.1µF | 0603 | 1 | Battery-ADC node filter — matches firmware's 30ms settling delay |
| C10 | 0.1µF | 0603 | 1 | ADXL345 VDD I/O decoupling |
| C11 | 1µF | 0603 | 1 | ADXL345 VS — datasheet calls for 1µF here specifically |

## Connectors / mechanical

| Ref | Part | Qty | Notes |
|---|---|---|---|
| J1 | USB-C 16-pin receptacle, power-only | 1 | LCSC C165948. Mounts on top cap, above waterline |
| J3 | JST-PH 2-pin | 1 | Cell leads |
| J4 | 2.54mm 6-pin header | 1 | Programming only, not populated in the field |
| SW1 | Tactile button | 1 | IO0 boot-mode select — optional if flashing via J4 only |

## Off-board (not on PCB order)

18650 cell (~2500mAh), sealed floating housing (~37×125mm), ballast
(20-50g), thermal epoxy, O-ring/gasket, desiccant sachet, foam spacer,
USB-C port plug — unchanged from `hardware/BOM_TEMP_GRAVITY.md` §2, these
are procurement items for the part-sourcer/assembly stage, not SKiDL
netlist parts.

## Open items for part-sourcer

1. Confirm live stock on C129490 (MCP9808, 897 units) at order-time
   quantity — closest to the 500-unit warning threshold of any part here.
2. Re-total per-unit cost at actual 15-25 unit JLCPCB pricing tiers (see
   `ic_selection.md` cost-delta note) — the $13-25/unit landed figure in
   `hardware/BOM_TEMP_GRAVITY.md` was estimated before live pricing.
3. R3/DS18B20 net is conditional — confirm with the user whether this
   build is MCP9808-only or should also support the DS18B20 fallback
   before finalizing the netlist.
