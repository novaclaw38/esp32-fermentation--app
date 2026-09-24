# ESP32 Dev Kit V1 Bench Prototype

A self-contained sibling project to
[`../esp8266-tilt-prototype/`](../esp8266-tilt-prototype/) — same bench
rig concept (TP4056 charger + GY-291/ADXL345 + ungated battery divider),
same target use case (the bench axis-test and gravity-calibration steps
in [`../hardware/PROTOTYPE_TEMP_GRAVITY.md`](../hardware/PROTOTYPE_TEMP_GRAVITY.md)),
but on a generic **ESP32 Dev Kit V1** (30-pin WROOM-32 breakout) instead
of an ESP8266 D1 Mini, and a **DHT11** instead of an MCP9808/DS18B20 for
temperature (see `datasheets/DHT11_SUMMARY.md`).

Unlike the ESP8266 sibling, the firmware needed almost no porting: the
production board's own sketch
([`../firmware/fermentation_tilt_v1/`](../firmware/fermentation_tilt_v1/))
already targets a bare ESP32 with the exact same GPIO numbers this
design uses — see [`SPEC.md`](SPEC.md) for why, and
[`firmware/fermentation_tilt_v1_esp32_devkit/`](firmware/fermentation_tilt_v1_esp32_devkit/)
for the (small) delta. The DHT11 swap, however, *did* need real
firmware changes (its own library, its own read function) — it's not a
wiring-only substitution the way MCP9808↔DS18B20 is on the sibling rigs.

## Status

| Stage | Status |
|---|---|
| SPEC | ✅ [`SPEC.md`](SPEC.md) |
| Architecture | ✅ [`architecture/`](architecture/) — block diagram, net plan, module selection, design risks |
| Sourcing | ⚠️ Partial — see [`sourcing/sourced_parts.md`](sourcing/sourced_parts.md) (only the divider resistors are a real sourcing item; the three breakouts + MCU are user-supplied and unverified) |
| Datasheets | ✅ [`datasheets/`](datasheets/) |
| SKiDL wiring diagram | ✅ ERC PASS (0 errors, 0 warnings), all footprints valid — [`circuits/esp32_devkit_tilt_prototype/`](circuits/esp32_devkit_tilt_prototype/), [`outputs/`](outputs/) |
| Firmware | ✅ **Compiles clean** against `esp32:esp32` core 3.3.12, board `esp32doit-devkit-v1` (`arduino-cli compile`, exit 0) — [`firmware/fermentation_tilt_v1_esp32_devkit/`](firmware/fermentation_tilt_v1_esp32_devkit/) |
| Hardware verification | ❌ **Unverified** — no photo of the actual board checked yet, see below |
| Physical build | ✅ [`BUILD_GUIDE.md`](BUILD_GUIDE.md) / [`outputs/protoshield_build_guide.pdf`](outputs/protoshield_build_guide.pdf) — not yet physically assembled |

## What's genuinely verified vs. what isn't

**Verified in this environment:**
- SKiDL wiring diagram: ERC passes, footprints validate.
- Firmware: compiles clean, real memory numbers measured (85% flash,
  15% RAM — comfortable headroom, notably better than the ESP8266
  rig's tight 93% IRAM situation).

**Not verified — no hardware photo checked yet:**
- Whether the specific ESP32 Dev Kit V1 board on hand actually exposes
  `GPIO4`/`21`/`22`/`25`/`34`/`3V3`/`VIN`/`GND` where expected — "Dev
  Kit V1" is a cloned form factor with real layout variance across
  vendors, see `architecture/design_risks.md`.
- TP4056 breakout protection status carries over the ESP8266 rig's
  finding *only if it's literally the same physical module*. Re-verify
  if not.

**Verified by user photo:**
- DHT11 is the bare 4-pin Asair variant (no onboard pull-up) — `R3`
  (10kΩ) added to the circuit. See `datasheets/DHT11_SUMMARY.md`.
- GY-291's `SDO`/`CS` are dedicated pins (silkscreen `GND VCC CS INT1
  INT2 SDO SDA SCL`), not internally tied, and the printed X/Y/Z axis
  diagram is present.

## Quick start

**Building it on a Prototype Shield v.5?** See
[`BUILD_GUIDE.md`](BUILD_GUIDE.md) (or the rendered
[`outputs/protoshield_build_guide.pdf`](outputs/protoshield_build_guide.pdf))
for a physical placement diagram and numbered assembly steps — covers
all of the below plus exactly where each module goes, and a note that
a 30-pin Dev Kit V1 is a tighter fit than the ESP8266 rig's D1 Mini
was.

1. Wire per [`architecture/net_plan.md`](architecture/net_plan.md) (or
   view [`outputs/esp32_devkit_tilt_prototype.pdf`](outputs/esp32_devkit_tilt_prototype.pdf)
   for the electrical schematic).
2. Open
   `firmware/fermentation_tilt_v1_esp32_devkit/fermentation_tilt_v1_esp32_devkit.ino`,
   fill in the `CONFIG` section (WiFi, Supabase URL/key, device
   ID/secret — same placeholders as the other two sketches).
3. In Arduino IDE: **Boards Manager** → install **esp32 by Espressif
   Systems** (this project was verified against core 3.3.12) → select
   board **"DOIT ESP32 DEVKIT V1"** (FQBN `esp32:esp32:esp32doit-devkit-v1`).
   Libraries needed: **"DHT sensor library"** (Adafruit) + its
   **"Adafruit Unified Sensor"** dependency (everything else ships with
   the ESP32 core).
4. Flash, open the serial monitor at 115200 baud.
5. Follow the axis test and calibration steps in
   [`../hardware/PROTOTYPE_TEMP_GRAVITY.md`](../hardware/PROTOTYPE_TEMP_GRAVITY.md)
   — unchanged by any of this.
