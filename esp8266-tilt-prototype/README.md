# ESP8266 D1 Mini Bench Prototype

A self-contained sibling project to the main repo's production
`temp_gravity_module` PCB pipeline — this one targets the user's on-hand
**ESP8266 D1 Mini** (confirmed by photo) plus two off-the-shelf breakout
modules, for the bench axis-test and gravity-calibration steps in
[`../hardware/PROTOTYPE_TEMP_GRAVITY.md`](../hardware/PROTOTYPE_TEMP_GRAVITY.md).

The production firmware
([`../firmware/fermentation_tilt_v1/`](../firmware/fermentation_tilt_v1/))
targets an **ESP32** D1 Mini and will not run on this board — see
[`SPEC.md`](SPEC.md) for why, and
[`firmware/fermentation_tilt_v1_esp8266/`](firmware/fermentation_tilt_v1_esp8266/)
for the full port.

## Status

| Stage | Status |
|---|---|
| SPEC | ✅ [`SPEC.md`](SPEC.md) |
| Architecture | ✅ [`architecture/`](architecture/) — block diagram, net plan, module selection, design risks |
| Sourcing | ✅ [`sourcing/sourced_parts.md`](sourcing/sourced_parts.md) |
| Datasheets | ✅ [`datasheets/`](datasheets/) |
| SKiDL wiring diagram | ✅ ERC PASS (0 errors, 0 warnings), all footprints valid — [`circuits/esp8266_tilt_prototype/`](circuits/esp8266_tilt_prototype/), [`outputs/`](outputs/) |
| Firmware | ✅ **Compiles clean** against `esp8266:esp8266` core 3.1.2 (`arduino-cli compile`, exit 0) — [`firmware/fermentation_tilt_v1_esp8266/`](firmware/fermentation_tilt_v1_esp8266/) |
| Hardware verification | ✅ All 4 items resolved (TP4056 protection, GY-291 SDO/CS, D0-RST jumper, A0 divider) — see below |
| Physical build | ⚠️ **Not yet powered on / run end-to-end** — see below |

## Hardware verification — all four items resolved

Everything originally flagged here has been checked against the actual
boards (photos + user's own multimeter/soldering):

✅ **TP4056 breakout — protected.** 3 ICs confirmed (TP4056 + DW01A +
FS8205A). Cleared for the battery/float test.

✅ **GY-291 `SDO`/`CS` — dedicated pins, not internally tied.** Wired
explicitly: `SDO`→`GND`, `CS`→`3V3`. The board also has a printed X/Y/Z
axis diagram, useful for the tilt-axis calibration step.

✅ **D0-to-RST "SLEEP" jumper — soldered.** Recommended (not blocking):
a 10-second multimeter continuity check between `D0` and `RST` before
the first real deep-sleep cycle — a cold joint on this one pad is
otherwise indistinguishable from "never wakes."

✅ **A0 onboard divider — confirmed present, ~220kΩ/100kΩ.** Unlike a
genuine Wemos D1 Mini, this clone has its own divider between the `A0`
header pin and the chip. **The external divider was redesigned as a
result**: R1/R2 changed from 330k/100k to **10k/22k**, now targeting
the board's ~3.2V header ceiling instead of the chip's 1.0V limit
directly (the onboard divider does that second stage). Firmware
`BATTERY_DIVIDER_MULTIPLIER` updated to **4.6545** to match. Re-verified
after the change: ERC still 0 errors/0 warnings, firmware still
compiles clean. See `architecture/net_plan.md` for the full derivation.
**Recommended:** calibrate the first real reading against a multimeter
— the onboard ratio was read off the board, not precision-measured, so
this combined multiplier carries more uncertainty than a single-stage
divider would.

## What's genuinely verified vs. what isn't

**Verified in this environment:**
- SKiDL wiring diagram: ERC passes, footprints validate (re-confirmed
  after the divider redesign).
- Firmware: compiles clean, real memory numbers measured (IRAM is at
  93% — tight, see `architecture/design_risks.md`, but sufficient for
  this feature set as written).

**Verified by the user (photos + soldering + multimeter):**
- The TP4056 breakout is protected.
- The GY-291's `SDO`/`CS` are dedicated pins.
- The "SLEEP" jumper pad next to `D0` is soldered/bridged.
- `A0` has an onboard divider (~220k/100k).

**Recommended follow-up checks (not blocking):**
- Continuity of the `D0`-`RST` bridge.
- Calibrate the two-stage battery-voltage reading against a multimeter.

**Not verified — cannot be, without the physical hardware:**
- Whether `WiFiClientSecure`'s BearSSL handshake to Supabase succeeds
  under real runtime heap pressure (compiling only checks static
  memory, not dynamic/runtime heap).
- The ADXL345 tilt-axis assumption (same open item as the ESP32
  prototype doc — resolved by the calibration procedure, not by this
  circuit's design).

## Quick start

1. Resolve the four unverified items above.
2. Wire per [`architecture/net_plan.md`](architecture/net_plan.md) (or
   view [`outputs/esp8266_tilt_prototype.pdf`](outputs/esp8266_tilt_prototype.pdf)
   for the visual wiring diagram).
3. Open `firmware/fermentation_tilt_v1_esp8266/fermentation_tilt_v1_esp8266.ino`,
   fill in the `CONFIG` section (same placeholders as the ESP32 sketch:
   WiFi, Supabase URL/key, device ID/secret).
4. Install the ESP8266 board package (Boards Manager URL:
   `http://arduino.esp8266.com/stable/package_esp8266com_index.json`),
   select board **"LOLIN(WEMOS) D1 R2 & mini"** (or the generic
   `esp8266:esp8266:d1_mini` FQBN), flash.
5. Follow the axis test and calibration steps in
   [`../hardware/PROTOTYPE_TEMP_GRAVITY.md`](../hardware/PROTOTYPE_TEMP_GRAVITY.md)
   — unchanged by any of this, they're firmware-behavior steps, not
   board-specific ones.
