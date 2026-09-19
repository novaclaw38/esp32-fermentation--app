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
| Physical build | ⚠️ **Not built or tested on real hardware** — see below |

## Before you wire anything — unverified items

These are flagged throughout `architecture/design_risks.md` but worth
repeating in one place, since they're the difference between "works" and
"looks dead":

1. **Verify `A0` has no onboard divider** on this specific clone (a
   multimeter continuity check) before trusting the 330k/100k external
   divider math. **Status: being checked by the user now.**

✅ **TP4056 breakout — resolved.** User photo confirms 3 ICs (TP4056 +
DW01A + FS8205A), the protected-board signature. Cleared for the
battery/float test.

✅ **GY-291 `SDO`/`CS` — resolved.** User photo confirms both are
dedicated header pins, not internally tied. Wired explicitly in the
circuit: `SDO`→`GND`, `CS`→`3V3`. The board also has a printed X/Y/Z
axis diagram, useful for the tilt-axis calibration step.

✅ **D0-to-RST "SLEEP" jumper — soldered.** User confirms the pad is
bridged. **Worth a 10-second multimeter continuity check between `D0`
and `RST` before the first real deep-sleep cycle** — a cold joint on
this one pad is otherwise indistinguishable from "never wakes."

## What's genuinely verified vs. what isn't

**Verified in this environment:**
- SKiDL wiring diagram: ERC passes, footprints validate.
- Firmware: compiles clean, real memory numbers measured (IRAM is at
  93% — tight, see `architecture/design_risks.md`, but sufficient for
  this feature set as written).

**Verified by the user (photos + soldering):**
- The TP4056 breakout is protected (3 ICs: TP4056 + DW01A + FS8205A).
- The GY-291's `SDO`/`CS` are dedicated pins, not internally tied.
- The "SLEEP" jumper pad next to `D0` is now soldered/bridged.

**Not yet verified:**
- Whether `A0` has an onboard divider on this specific clone (in progress).
- Continuity of the newly-soldered `D0`-`RST` bridge (a quick multimeter
  check, recommended above, not yet confirmed).

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
