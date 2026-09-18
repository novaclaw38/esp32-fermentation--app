# IC / Critical-Part Selection — Temp + Gravity Module

All candidates verified live against JLCPCB stock via the `pcbparts` MCP
(`jlc_search`/`jlc_get_part`) on 2026-09-18. Costs below are **real**
JLCPCB unit prices, not estimates — several differ materially from the
figures in `hardware/BOM_TEMP_GRAVITY.md`; deltas are called out per row.

## Block 2 — Li-ion Charge & Protection

| Candidate | LCSC | Tier | Stock | Price (1+) | Notes |
|---|---|---|---|---|---|
| **TP4056 (TPOWER)** ✅ | C382139 | Extended | 34,438 | $0.127 | Matches BOM. Iq 1µA. Huge stock offsets extended-tier risk |
| DW01A (PUOLOP) ✅ | C351410 | Extended | 122,811 | $0.042 | Best-stock DW01A candidate — BOM only said "search DW01A", no LCSC# given |
| DW01A (Slkor) alt | C42380662 | Extended | 18,231 | $0.021 | Lower Iq (700nA vs 3µA) but 6.7x less stock; not worth it here |
| FS8205A (TECH PUBLIC) ✅ | C2830320 | Extended | 71,515 | $0.050 | Best-stock FS8205A candidate |
| FS8205A (FUXINSEMI) alt | C908265 | Extended | 25,765 | $0.071 | Lower RDS(on) (18mΩ vs 31.5mΩ) — irrelevant at this current, skip |

**Recommendation**: TP4056 C382139 + DW01A C351410 + FS8205A C2830320 — as
the SPEC requires (bare TP4056 alone is insufficient protection).

## Block 3 — 3V3 Regulation

| Candidate | LCSC | Tier | Stock | Price (1+) | Notes |
|---|---|---|---|---|---|
| **XC6206P332MR-G (Torex)** ✅ | C5446 | **Basic** | 478,653 | $0.142 | Matches BOM exactly. Datasheet Iq = 1µA, comfortably under the <5µA spec requirement |

**Recommendation**: C5446, no contest — basic tier, half-million stock,
Iq spec beats the requirement with margin. No alternate needed.

## Block 4 — Battery Sense Gate (Q1/Q2)

| Candidate | LCSC | Tier | Stock | Price (1+) | Notes |
|---|---|---|---|---|---|
| **AO3401A (PMOS, Q1)** ✅ | C15127 | Basic | 402,029 | $0.094 | Matches BOM. Vgs(th) 900mV — confirms the PCB_DESIGN.md DFM note that a direct-GPIO drive can't guarantee full off |
| **MMBT3904 (NPN, Q2)** ⚠️ **corrected** | C20526 | **Basic, preferred** | 291,770 | $0.012 | **The BOM's LCSC# for Q2 (C8598) is wrong** — that code resolves to a B5819W Schottky diode, not an MMBT3904. C20526 is the real basic-tier MMBT3904 part |

**Recommendation**: AO3401A C15127 + MMBT3904 C20526. **Flag the C8598
correction to the part-sourcer and skeleton_bom.md below — this would
have produced a broken netlist/BOM if carried forward unchecked.**

## Block 5 — ESP32 MCU Core

| Candidate | LCSC | Tier | Stock | Price (1+) | Notes |
|---|---|---|---|---|---|
| **ESP32-WROOM-32E-N16 (Espressif)** ✅ | C701343 | Extended | 2,228 | $5.06 | Matches BOM's part choice. **Price is ~2.3x the BOM's $2.20 estimate** — reflects current market, not a sourcing error |

**Recommendation**: C701343 — no basic/preferred-tier alternative exists
for ESP32 modules at JLCPCB (WiFi modules require hand-placement/RF
tuning industry-wide, always extended tier). Classic ESP32 (not S3/C3)
is a hard requirement — GPIO4/21/22/25/34 mapping in
`firmware/fermentation_tilt_v1/` depends on it.

## Block 6 — I2C Sensor Bus (Tilt + Temperature)

| Candidate | LCSC | Tier | Stock | Price (1+) | Notes |
|---|---|---|---|---|---|
| **ADXL345BCCZ-RL7 (Analog Devices)** ✅ | C9667 | Extended | 12,663 | $5.96 | Genuine ADI part. **Price is ~3.3x the BOM's $1.80 estimate** |
| ADXL345BCCZ alt | C579456 | Extended | 4,387 | $6.70 | Same specs, less stock, higher price — no reason to switch |
| **MCP9808T-E/MS (Microchip)** ✅ | C129490 | Extended | 897 | $2.14 | MSOP-8. **Price is ~2-4x the BOM's $0.50-1 estimate.** Stock (897) clears the >500 warning threshold but isn't deep — worth a stock re-check at order time |
| MCP9808T-E/MC alt | C194710 | Extended | 401 | $2.43 | DFN-8, **stock below the 500-unit warning threshold** — MSOP-8 (C129490) preferred on both stock and hand/AOI-inspectability |

**Recommendation**: ADXL345 C9667 + MCP9808 C129490. Both are
single-source parts by design (Analog Devices / Microchip proprietary
ICs) — flag as single-source per sourcing rules, no functional
alternative changes the risk.

## Block 1 — USB-C Power Input

| Candidate | LCSC | Tier | Stock | Price (1+) | Notes |
|---|---|---|---|---|---|
| **TYPE-C-31-M-12 (Korean Hroparts)** ✅ | C165948 | Extended | 202,462 | $0.186 | Matches BOM. Extended tier is standard for full-pinout USB-C receptacles; huge stock offsets it |

**Recommendation**: C165948, unchanged.

## Cost-delta summary vs. BOM_TEMP_GRAVITY.md

The documented on-board subtotal (~$5.07) was based on estimates made
before live pricing was available. Real JLCPCB unit prices push the
active-parts subtotal to roughly **$14-15** at 1-unit pricing (mostly
driven by ESP32 $5.06, ADXL345 $5.96, MCP9808 $2.14 vs. their combined
~$4.50 estimate) — all three drop meaningfully at 15-25 unit quantity via
JLCPCB's tiered pricing, but the part-sourcer should re-total the BOM at
the actual batch quantity rather than trusting the per-unit estimates in
the existing docs.

## Extended-tier assembly-fee note

Five of the seven ICs on this board (TP4056, DW01A, FS8205A, ESP32,
ADXL345, MCP9808, USB-C) are Extended tier. JLCPCB charges the assembly
fee **per unique extended part number**, not per placed unit, so this is
a fixed ~$21 (7 × $3) one-time NRE-class cost for the run, not a per-unit
cost — worth confirming against the actual JLCPCB quote before the batch
order, but not a reason to redesign around it at this quantity.
