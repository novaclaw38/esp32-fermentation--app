# Sourced BOM — Temp + Gravity Module

All parts verified live against JLCPCB stock via `pcbparts` MCP
(`jlc_search`/`jlc_get_part`) on 2026-09-18. All ICs have a confirmed
EasyEDA footprint (`has_easyeda_footprint: true`) — convertible to KiCad
via the standard easyeda2kicad path; exact standard-library names given
for generic passives/connectors below. No parts required footprint
fallback to `⚠️ CUSTOM FP NEEDED`.

Format: `MPN | LCSC# | Stock | Unit Price | Package | JLCPCB Tier | KiCad Footprint | Notes`

## Active parts

| MPN | LCSC# | Stock | Unit Price | Package | Tier | KiCad Footprint | Notes |
|---|---|---|---|---|---|---|---|
| ESP32-WROOM-32E-N16 | C701343 | 2,228 | $5.0625 | Module 25.5×18mm | Extended | EasyEDA conv. (`RF_Module:ESP32-WROOM-32` class) | Single-source module; no basic/preferred alt exists industry-wide |
| TP4056 (TPOWER) | C382139 | 34,438 | $0.1273 | ESOP-8 | Extended | EasyEDA conv. | High stock offsets extended tier |
| DW01A (PUOLOP) | C351410 | 122,811 | $0.0419 | SOT-23-6L | Extended | EasyEDA conv. | Best-stock DW01A candidate |
| FS8205A (TECH PUBLIC) | C2830320 | 71,515 | $0.0497 | SOT-23-6 | Extended | EasyEDA conv. | Best-stock FS8205A candidate |
| XC6206P332MR-G | C5446 | 478,653 | $0.1422 | SOT-23-3 | **Basic** | EasyEDA conv. | Iq 1µA confirmed via datasheet spec |
| ADXL345BCCZ-RL7 | C9667 | 12,663 | $5.9578 | LGA-14(3x5) | Extended | EasyEDA conv. | Single-source (Analog Devices) |
| MCP9808T-E/MS | C129490 | 897 | $2.1406 | MSOP-8 | Extended | EasyEDA conv. | Single-source (Microchip). Stock nearest the 500-unit warning line — re-check before order |
| AO3401A | C15127 | 402,029 | $0.0943 | SOT-23 | **Basic** | EasyEDA conv. | Vgs(th) 900mV |
| MMBT3904 | C20526 | 291,770 | $0.0116 | SOT-23 | **Basic, preferred** | EasyEDA conv. | **Corrects `hardware/BOM_TEMP_GRAVITY.md`'s C8598, which is a Schottky diode, not this transistor** |
| LED red, 0603 | C2286 | 3,255,244 | $0.0075 | 0603 | **Basic** | `LED_SMD:LED_0603_1608Metric` | D1, TP4056 CHRG |
| LED green, 0603 | C52675989 | 226,154 | $0.0035 | 0603 | Extended | `LED_SMD:LED_0603_1608Metric` | D2, TP4056 STDBY — no basic-tier green 0603 LED exists in the DB |

## Resistors (all 0603, basic tier, ±1%)

| MPN | LCSC# | Stock | Unit Price | Tier | KiCad Footprint | Ref / Notes |
|---|---|---|---|---|---|---|
| 0603WAF1003T5E (100kΩ) | C25803 | 22,656,083 | $0.0032 | Basic | `Resistor_SMD:R_0603_1608Metric` | R1, R2 — battery divider |
| 0603WAF4701T5E (4.7kΩ) | C23162 | 24,680,139 | $0.0030 | Basic | `Resistor_SMD:R_0603_1608Metric` | R3 (optional), R7, R8 |
| 0603WAF1002T5E (10kΩ) | C25804 | 22,373,597 | $0.0027 | Basic | `Resistor_SMD:R_0603_1608Metric` | R4, R5, R10 |
| 0603WAF1201T5E (1.2kΩ) | C22765 | 2,132,753 | $0.0043 | Basic | `Resistor_SMD:R_0603_1608Metric` | R9 — PROG, sized for 2500mAh cell |
| 0603WAF5101T5E (5.1kΩ) | C23186 | 22,349,781 | $0.0019 | Basic | `Resistor_SMD:R_0603_1608Metric` | R11, R12 — USB-C CC pull-downs, required |
| 0603WAF2001T5E (2kΩ) | C22975 | 15,181,495 | $0.0024 | Basic | `Resistor_SMD:R_0603_1608Metric` | R13, R14 — LED current limit |

Note: R6 (100kΩ, Q1 gate pull-up) uses the same MPN as R1/R2 (C25803).

## Capacitors

| MPN | LCSC# | Stock | Unit Price | Package | Tier | KiCad Footprint | Ref / Notes |
|---|---|---|---|---|---|---|---|
| CL10A105KB8NNNC (1µF, 50V, X5R) | C15849 | 7,052,997 | $0.0140 | 0603 | Basic | `Capacitor_SMD:C_0603_1608Metric` | C1, C7, C8, C11 |
| CC0603KRX7R9BB104 (0.1µF, 50V, X7R) | C14663 | 52,391,718 | $0.0124 | 0603 | Basic | `Capacitor_SMD:C_0603_1608Metric` | C2, C3, C9, C10 |
| CL21A226MAQNNNE (22µF, 25V, X5R) | C45783 | 4,575,223 | $0.2432 | 0805 | Basic | `Capacitor_SMD:C_0805_2012Metric` | C4 — 3V3 bulk |
| CL21A106KAYNNNE (10µF, 25V, X5R) | C15850 | 6,265,685 | $0.0844 | 0805 | Basic | `Capacitor_SMD:C_0805_2012Metric` | C5, C6 |

## Connectors / mechanical

| MPN | LCSC# | Stock | Unit Price | Tier | KiCad Footprint | Ref / Notes |
|---|---|---|---|---|---|---|
| TYPE-C-31-M-12 | C165948 | 202,462 | $0.1859 | Extended | EasyEDA conv. | J1 — USB-C power-only receptacle |
| B2B-PH-K-S(LF)(SN), JST | C131337 | 232,710 | $0.0354 | Extended | `JST_PH_S2B-PH-K_1x02_P2.00mm_Vertical` | J3 — genuine JST brand preferred here specifically: reversed battery JST is flagged as a common field-failure mode in PCB_DESIGN.md's DFM checklist, correct keying matters more than the $0.03 delta to a generic clone |
| 2.54-1x6P Straight pin | C37208 | 311,143 | $0.0416 | Extended | `Connector_PinHeader_2.54mm:PinHeader_1x06_P2.54mm_Vertical` | J4 — programming header |
| TS-1088-AR02016 | C720477 | 1,001,902 | $0.0538 | Basic | `Button_Switch_SMD:SW_SPST_TS-1187A-B-A-B` (verify exact footprint name against part datasheet at layout time) | SW1 — tactile button, IO0 boot select |

## sourcing_status: success

All parts sourced with stock comfortably above the 100-unit floor (MCP9808
at 897 is the closest to any threshold, still 79% above the 500-unit
warning line). No `sourcing/sourcing_failures.md` needed.

## Notes for datasheet-librarian / skidl-coder

- MCP9808 stock (897) should be re-checked at actual order time given how
  close it sits to the warning threshold — not a blocker now, a timing
  risk if the batch order slips weeks.
- SW1's exact KiCad footprint name should be confirmed against the
  vendor datasheet during layout — package family is right but the
  generic footprint-library name wasn't independently verified here.
