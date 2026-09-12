# Fermentation Monitor — Custom PCB (v2 hardware path)

Produced with the [`pcb-designer`](../.claude/skills/pcb-designer/SKILL.md) skill.
This replaces the v1 BOM's "ESP32 DevKit + perfboard + breakout modules"
(see `docs/IMPLEMENTATION_PLAN.md`) with a single small-batch PCB, for once
you're past the perfboard prototype and into the 15-25 unit pre-sold batch
(Phase 2). Almost every net below lands on the same GPIOs the sketch already
uses — the one exception is the battery-divider enable line, which needs a
small firmware addition (see §2 and `schematic.html`).

A hand-drawn schematic covering every net in this document is in
[`hardware/schematic.html`](schematic.html) — open it directly or view the
published version linked from the PR/session.

## Why move off the DevKit

A DevKit board is a full breakout with its own USB-serial chip, 5V input
LDO, and a bunch of pins you don't need — fine for a one-off prototype, not
for something you're assembling 15-25 of. A bare ESP32 module on a
purpose-built PCB is smaller, cheaper per unit at this quantity, and removes
the perfboard/jumper-wire failure points that "will eat unexpected time"
line in the implementation plan was warning about.

## Two design decisions the naive version of this gets wrong

1. **Don't wire the battery straight into the module's 3V3 pin.** A fresh
   18650 sits at ~4.2V; the ESP32's absolute max on 3V3 is 3.6V. Some
   battery-ESP32 projects get away with feeding a *partially discharged*
   LiPo straight into 3V3, but a freshly-charged cell off the TP4056 will
   exceed spec. This design keeps a dedicated LDO between `BAT+` and the
   module's 3V3 rail.
2. **The LDO's own quiescent current has to be sub-10µA, not the ~5mA of a
   generic AMS1117.** The whole point of this board is deep-sleep battery
   life measured in weeks. An AMS1117-class LDO alone would draw more
   current than the ESP32 does in deep sleep (~10-150µA), quietly
   defeating the "runs weeks on batteries" claim in the implementation
   plan. Use a low-Iq part (XC6206, MCP1700, or similar — see BOM).

## 1. Block Diagram

```
                    ┌─────────────────┐
  USB-C ───────────►│     TP4056      │
  (charge only)     │  Li-ion charger │
                    └────────┬────────┘
                             │ BAT+ / BAT-
                    ┌────────▼────────┐
  18650 holder ────►│  DW01A + FS8205 │  (over-discharge / over-current
  (unprotected cell)│  protection     │   protection -- NOT included on a
                    └────────┬────────┘   bare TP4056 IC, unlike many of
                             │             the $0.50 breakout MODULES)
              ┌──────────────┼──────────────┐
              │              │              │
      100k/100k divider   XC6206-3.3V LDO  (BAT+ also feeds the LDO input
      → GPIO34 (ADC1_6)   (Iq < 5µA)        directly, always-on)
              │              │
              │        ┌─────▼─────┐
              │        │   3V3      │
              │        └─────┬─────┘
              │   ┌───────────┼───────────┐
              │   │           │           │
              │  EN(10k+1µF) IO0(10k+btn) VDD (0.1µF ×2 + 10µF bulk)
              │   │           │           │
              │   └───────────┴─────┬─────┘
              │              ┌──────▼──────┐
              │              │ ESP32-WROOM-│
              └─────────────►│    32E      │
   GPIO34 (battery sense)    │             │
                             └──────┬──────┘
                                    │ GPIO4 + 4.7k pull-up to 3V3
                             ┌──────▼──────┐
                             │  DS18B20    │──── JST-PH 3-pin (VCC/GND/DATA)
                             │ (off-board, │     board-edge connector, cable
                             │  waterproof)│     to the waterproof probe
                             └─────────────┘

  Programming: 6-pin header (3V3, GND, TX, RX, EN, IO0) for an external
  USB-UART dongle -- see "Programming header vs onboard USB-serial" below.
```

## 2. Power Budget

| Rail | Consumer | Current | Notes |
|---|---|---|---|
| BAT+ (3.0-4.2V) | TP4056 charge path | up to ~1A | only while USB connected |
| 3V3 | ESP32-WROOM-32E, WiFi TX burst | ~160-240mA peak | few-hundred-ms bursts during POST |
| 3V3 | ESP32 deep sleep | ~10-150µA | dominant term for battery life |
| 3V3 | LDO quiescent (XC6206) | <5µA | must stay well under deep-sleep draw |
| 3V3 | DS18B20 | ~1mA active, ~1µA standby | only powered during the ~750ms conversion |
| 3V3 | Battery divider (100k+100k) | ~4.2V / 200kΩ ≈ 21µA | continuous *unless* gated — see DFM note below |

**DFM note on the divider**: as drawn, the 100k/100k divider draws ~21µA
continuously any time the battery is above 0V — that's *more* than the
ESP32's own deep-sleep current, and would roughly double your sleep-current
budget for no reason. Gate it with a high-side PMOS (Q1) so it only draws
current for the few milliseconds per wake cycle when you're actually taking
the reading. This is a **change worth making now** — it costs one SOT-23
PMOS, one small NPN, and two resistors, and roughly doubles standby battery
life.

Don't wire the GPIO straight to the PMOS gate, though — a push-pull GPIO
driving HIGH (3.3V) overpowers a simple pull-up resistor regardless of what
it's fighting, so the "off" state lands at 3.3V, not at `BAT+` (up to
4.2V). That leaves V<sub>GS</sub> around −0.9V on a freshly-charged cell —
inside the threshold region for a part like the AO3401, not solidly off.
Use a small NPN (Q2) as a low-side switch instead: GPIO HIGH pulls the
PMOS gate to ~0V through Q2 (strongly on); GPIO LOW/floating leaves R6 to
pull the gate all the way to `BAT+` (V<sub>GS</sub> = 0, off regardless of
cell voltage). See `schematic.html` for the full circuit.

At a rough weighted average of ~30-50µA sleep-dominant draw (after gating
the divider) against an 18650's ~2500-3000mAh capacity, that's still deep
into "runs for months," consistent with the original plan's "weeks on
batteries" claim with real margin.

## 3. Schematic Notes (net-by-net)

| Net | From | To | Value/Component | Matches firmware? |
|---|---|---|---|---|
| `ONE_WIRE` | ESP32 GPIO4 | DS18B20 DATA (via JST-PH) | 4.7kΩ pull-up to 3V3 | Yes — `ONE_WIRE_BUS` = 4, unchanged |
| `BATT_SENSE` | 3V3 (gated) | GPIO34 | 100kΩ / 100kΩ divider | Yes — `readBatteryVoltage()` assumes 1:1, x2 multiplier |
| `EN` | 3V3 | ESP32 EN | 10kΩ pull-up + 1µF to GND | Standard ESP32 boot RC delay |
| `IO0` | 3V3 | ESP32 IO0 | 10kΩ pull-up + tactile button to GND | Boot-mode select; button optional if flashing via header only |
| `PROG_HDR` | — | TX/RX/3V3/GND/EN/IO0 | 2.54mm 6-pin header | External USB-UART dongle for flashing |
| `VDD_DECOUPLE` | 3V3 | GND | 2× 0.1µF at module VDD pins + 1× 10µF bulk | Per ESP32 minimum-circuit reference |
| `CHG_LED` | TP4056 CHRG/STDBY | 2× LED | 2kΩ series each | Charge-status indication, optional but cheap |

No pin assignments differ from `fermentation_monitor_v1.ino` — this is a
carrier board for the same firmware, not a redesign.

## 4. Bill of Materials

| Ref | Part | Package | Qty | Source/Part# | Est. unit cost | Notes |
|---|---|---|---|---|---|---|
| U1 | ESP32-WROOM-32E (not S3/C3) | Module | 1 | LCSC C701343 or equiv | ~$2.20 | Classic ESP32 keeps GPIO4/GPIO34 mapping identical to the firmware |
| U2 | TP4056 (bare IC, SOP-8) | SOP-8 | 1 | LCSC C382139 | ~$0.10 | Add PROG resistor for ~1A charge current |
| U3 | DW01A | SOT-23-6 | 1 | LCSC (search DW01A) | ~$0.05 | Over-discharge/over-current protection — **not present on a bare TP4056 IC** |
| U4 | FS8205A | SOT-23-6 | 1 | LCSC (search FS8205A) | ~$0.08 | Dual MOSFET pair paired with DW01A |
| U5 | XC6206P332MR (3.3V LDO, low-Iq) | SOT-23-3 | 1 | LCSC C5446 | ~$0.03 | **Not AMS1117** — Iq must stay in the single-digit µA range |
| Q1 | Small-signal PMOS (e.g. AO3401) | SOT-23 | 1 | LCSC C15127 | ~$0.02 | Gates the battery divider — see power-budget DFM note |
| Q2 | Small-signal NPN (e.g. MMBT3904) | SOT-23 | 1 | LCSC C8598 | ~$0.02 | Low-side switch for Q1's gate — a GPIO can't drive the PMOS gate directly, see DFM note |
| R12 | 10kΩ | 0603 | 1 | — | ~$0.01 | Q2 base resistor |
| R1,R2 | 100kΩ 1% | 0603 | 2 | — | ~$0.01 ea | Battery divider — matches firmware's 1:1 assumption exactly |
| R3 | 4.7kΩ | 0603 | 1 | — | ~$0.01 | DS18B20 1-Wire pull-up |
| R4 | 10kΩ | 0603 | 1 | — | ~$0.01 | EN pull-up |
| R5 | 10kΩ | 0603 | 1 | — | ~$0.01 | IO0 pull-up |
| R6 | ~10kΩ | 0603 | 1 | — | ~$0.01 | PMOS gate pull-up (Q1 off by default) |
| C1 | 1µF | 0603 | 1 | — | ~$0.02 | EN RC delay |
| C2,C3 | 0.1µF | 0603 | 2 | — | ~$0.02 ea | Module VDD decoupling |
| C4 | 10µF | 0805 | 1 | — | ~$0.03 | Bulk cap on 3V3 |
| C5,C6 | 10µF | 0805 | 2 | — | ~$0.03 ea | TP4056 input/output caps |
| J1 | USB-C 16-pin (power only) | SMD | 1 | LCSC C165948 | ~$0.15 | Charging input |
| R13,R14 | 5.1kΩ 1% | 0603 | 2 | — | ~$0.01 ea | USB-C CC1/CC2 pull-downs. **Not optional** — a USB-C charger will not enable VBUS without seeing them. A legacy USB-A→C cable masks this on the bench because it carries its own pull-up |
| J2 | JST-PH 3-pin, board-mount | SMD/THT | 1 | — | ~$0.10 | DS18B20 probe connector |
| J3 | JST-PH 2-pin, board-mount | THT | 1 | — | ~$0.08 | 18650 holder leads |
| J4 | 2.54mm 6-pin header | THT | 1 | — | ~$0.05 | Programming header |
| SW1 | Tactile button | SMD | 1 | — | ~$0.03 | IO0 boot-mode select (optional, see below) |
| D1,D2 | 0603 LED (red/green) | 0603 | 2 | — | ~$0.02 ea | Charge status, optional |
| — | 18650 holder | THT | 1 | (already in v1 BOM) | ~$0.30 | Off-board, wired via J3 |

**Estimated added PCB+assembly cost per unit at 15-25pcs**: roughly $3-5 for
a 2-layer board with SMT assembly at a JLCPCB-class fab, on top of the
component costs above (~$3) — comparable to or *cheaper* than the original
perfboard + DevKit + separate TP4056 module BOM once labor is counted,
since there's no hand-wiring.

## 5. Layer Count: 2-layer, not 4

Per the skill's decision matrix, ESP32+WiFi usually nudges toward 4-layer
for *production reliability*. For this specific board I'm recommending
**2-layer**, because:
- This is a 15-25 unit pre-sold batch, not a 100+ unit production run where
  the 4-layer cost delta amortizes away.
- The board has no other RF, no high-speed digital, and no dense mixed
  analog — the main 4-layer justification (clean planes for WiFi + other
  noisy neighbors) is weaker here than on a denser board.
- Thousands of shipped ESP32 hobbyist/small-batch products (Feather-class
  boards, etc.) run fine on 2-layer with a solid bottom GND pour and a
  respected antenna keep-out.

Revisit this for a v2 if/once the batch size grows past ~100 units — the
per-board cost delta shrinks at volume and the marginal WiFi robustness
becomes worth it.

## 6. Layout Guidance

1. **Fixed items first**: USB-C connector and JST probe/battery connectors
   on the board edge (for enclosure cutouts), 2× M3 mounting holes sized
   to the target enclosure.
2. **ESP32-WROOM-32E placement**: module's antenna edge faces a board
   edge, outward, away from the battery and any metal. Observe the
   15×15mm keep-out under/around the antenna on **every** layer — no
   copper, no components, no mounting holes.
3. **Power section** (TP4056, DW01A/FS8205, XC6206): cluster near the
   USB-C connector and battery connector, away from the ESP32 module —
   keeps switching/charge noise away from the radio and the 1-Wire line.
4. **DS18B20 JST connector**: place near the ESP32 side of the board so
   the 4.7kΩ pull-up and GPIO4 trace stay short; route away from the
   power section.
5. **Decoupling caps**: 0.1µF caps within 5mm of the module's VDD pins,
   short/direct via to the GND pour — don't route them on a long stub.
6. **Bottom layer**: solid GND pour (broken only where the antenna
   keep-out requires it), stitched to top-layer GND with vias every
   5-10mm along the board edges.

## 7. Programming header vs onboard USB-serial

The DevKit-based v1 flashes over USB directly because the DevKit carries
its own CH340/CP2102 chip. Moving to a bare module removes that chip from
each unit. Two options:

- **Onboard USB-serial chip** (~$0.50-1/unit, e.g. CH340C): every unit
  flashes over USB exactly like the DevKit did. Simplest at assembly time,
  costs a little more per unit, adds board area.
- **6-pin programming header + one shared external USB-UART dongle**
  (what the BOM above assumes): flash each unit at assembly with a jig
  and a single reusable FTDI/CH340 dongle. Saves ~$0.50-1 × 25 units, and
  since firmware OTA is already implemented for field updates, USB
  flashing is really only needed once per unit at assembly time anyway.

**Recommendation for this batch size (15-25 units): the header.** The
per-unit savings outweigh the minor assembly-time inconvenience of a jig,
and OTA covers every flash after the first. Revisit if a later batch grows
large enough that assembly-line USB flashing time becomes the bottleneck.

## 8. DFM Checklist (pre-export)

- [ ] Antenna keep-out (15×15mm, all layers) respected under ESP32 module
- [ ] All VDD pins have 0.1µF decoupling within 5mm
- [ ] EN: 10kΩ pull-up + 1µF RC delay present
- [ ] IO0: 10kΩ pull-up present; button (or header-only) confirmed
- [ ] Battery divider is gated (PMOS), not free-running
- [ ] PMOS gate is switched by Q2 (NPN low-side), not driven straight from a
      GPIO — a direct GPIO connection can't guarantee full off with `BAT+`
      above the GPIO's HIGH level
- [ ] DW01A + FS8205 protection present between cell and TP4056/load —
      don't rely on a bare TP4056 IC alone
- [ ] LDO is a low-Iq part (XC6206/MCP1700-class), not AMS1117-class
- [ ] USB-C CC1/CC2 pulled to GND via 5.1kΩ (power-only sink behavior)
- [ ] JST connectors keyed/polarized correctly (reversed battery JST is a
      common and expensive field-failure mode)
- [ ] Silkscreen shows polarity on battery/probe connectors and LED orientation
- [ ] Board outline + 2× M3 mounting holes match the target enclosure
      *before* ordering — this was flagged in the original plan as the
      step most likely to eat unexpected time
- [ ] 0 DRC errors, no isolated copper islands, all nets routed

## 9. What's intentionally unchanged from v1

- DS18B20 wiring (GPIO4, 4.7kΩ pull-up) — firmware-compatible as-is
- Battery divider ratio (100k/100k, GPIO34) — firmware-compatible as-is
- Deep-sleep + RTC-memory behavior, OTA path, remote-config fetch — all
  firmware-level, unaffected by the hardware change

## Next steps

1. Capture this schematic in KiCad or 立创EDA (see
   `.claude/skills/pcb-designer/references/kicad-workflow.md` or
   `lceda-workflow.md`) and run the skill's DFM pass on the actual
   layout before ordering.
2. Order a 2-5 unit prototype run first — verify the gated battery-divider
   circuit and real deep-sleep current draw on a multimeter before
   committing to the full 15-25 unit batch.
3. Update `docs/IMPLEMENTATION_PLAN.md`'s BOM table once real fab+assembly
   quotes come back, since the per-unit landed cost will differ from the
   perfboard-based estimate there.
