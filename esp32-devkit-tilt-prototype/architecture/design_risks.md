# Design Risks — ESP32 Dev Kit V1 Bench Prototype

## Firmware/hardware: minimal risk, unlike the ESP8266 port

Unlike the ESP8266 sibling, this does **not** need firmware rewritten
from scratch. The production sketch
(`../../firmware/fermentation_tilt_v1/fermentation_tilt_v1.ino`) already
targets a bare ESP32: `RTC_DATA_ATTR` for persistent state,
`Preferences` (NVS) for WiFi credentials, a native 12-bit/0-3.3V ADC,
single-argument `HTTPClient::begin()`, and no 32-bit microsecond
deep-sleep wraparound to work around. A Dev Kit V1 is the same
ESP32-WROOM-32 chip with those same GPIOs broken out directly. The only
functional delta from the production firmware is the battery-sense
change below.

## Hardware, unverified

1. **ESP32 Dev Kit V1 pin layout varies by manufacturer.** The GPIO
   *numbers* used in this design (4, 21, 22, 25, 34) are fixed by the
   WROOM-32 module itself and will behave identically on any board, but
   the *physical position* of each labeled pin on a 30-pin breakout
   varies between vendors (a well-known annoyance in the ESP32 hobbyist
   community — two boards both marketed as "Dev Kit V1" can differ).
   **Action:** locate pins by their printed GPIO label on your specific
   board, not by counting header position from this document's diagram
   or any generic online pinout image. No photo of the actual board has
   been provided yet to pin this down further.
2. **TP4056 breakout protection status** — carry over the ESP8266 rig's
   confirmed-protected verification only if it's literally the same
   physical board; otherwise re-count ICs (protected = 3, unprotected =
   1) before trusting the battery/float test.
3. **GY-291's `SDO`/`CS` pull** — carry over the ESP8266 rig's
   confirmed-dedicated-pins verification only if it's the same physical
   board; otherwise re-check per `hardware/PROTOTYPE_TEMP_GRAVITY.md`.
4. **MCP9808 breakout address pins** — verify `A0`/`A1`/`A2` default
   grounded (address `0x18`) on the specific board used, same caveat as
   the ESP8266 rig and the production board's own datasheet summary.

## Battery sense: ungated, single-stage (simpler than the ESP8266 rig)

- Battery divider left ungated (no Q1/Q2) — the prototype doc's own
  stated rationale (breadboard sleep-current budget doesn't need it)
  applies identically here. `readBatteryVoltage()` in the bench firmware
  keeps toggling `BATTERY_EN_PIN` for structural parity with the
  production sketch, but the pin drives nothing physical.
- **Single-stage divider, not two-stage.** The ESP32's ADC accepts
  0-3.3V natively — no onboard pre-divider quirk like the ESP8266 D1
  Mini clone had. The same 100kΩ/100kΩ divider already used on the
  production PCB works unchanged; see `net_plan.md` for the derivation.
  This removes an entire category of risk the ESP8266 build hit (the
  A0-onboard-divider surprise that forced a full redesign) — there is
  no equivalent hidden divider on a standard ESP32 Dev Kit V1's ADC
  pins.
- **ESP32 ADC nonlinearity near the rails is a known characteristic of
  the chip itself**, not something a divider choice fixes. Treat the
  `x2`-multiplied reading as a low-battery *warning*, not a precision
  fuel gauge, and calibrate the first real reading against a multimeter
  — same caveat the production firmware's own code comment already
  makes.

## What this design explicitly does not attempt

- No housing, potting, or sealed-unit concerns — bench testing only,
  same as the ESP8266 rig.
- No physical mounting/build guide in this initial pass (unlike the
  ESP8266 rig's Prototype Shield guide) — a Dev Kit V1 is typically used
  directly on a full-size breadboard rather than a shield. Add one if
  requested once the actual physical arrangement is known.
