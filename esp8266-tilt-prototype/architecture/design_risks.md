# Design Risks — ESP8266 D1 Mini Bench Prototype

## Firmware/hardware coupling (the reason this is a separate project)

1. **RTC memory is not automatic on ESP8266.** The ESP32 sketch relies
   on `RTC_DATA_ATTR`, which the compiler/linker persist across deep
   sleep for free. ESP8266 has no such attribute — persistent state
   (`consecutiveBreaches`, `alertActive`, `cycleCount`, `wifiFailures`,
   `sensorFaultAlerted`) is manually packed into a struct and written to
   RTC user memory via `ESP.rtcUserMemoryWrite()`/`Read()`, with a
   checksum to detect a cold boot (ESP8266's RTC memory is garbage on
   power-up, not zeroed) vs. a real wake. Implemented in
   `firmware/fermentation_tilt_v1_esp8266/`.
2. **No NVS on ESP8266.** WiFi credential storage is rewritten against
   `EEPROM.begin()/commit()` (flash-emulated), not `Preferences`.
3. **Battery ADC range differs.** ESP32: GPIO34, 12-bit, 0-3.3V. ESP8266:
   `A0` only, 10-bit, **0-1.0V**. Divider ratio and firmware multiplier
   both change — see `net_plan.md`.

## Hardware, resolved

1. ~~**TP4056 breakout protection status.**~~ ✅ **Confirmed protected**
   — user photo of the board (marking "03962A") shows three ICs: one
   SOP-8 (TP4056) plus two SOT-23-6 (DW01A + FS8205A), matching the
   protected-board signature. Cleared for the battery/float test.
2. ~~**GY-291's `SDO`/`CS` pull.**~~ ✅ **Confirmed as dedicated pins, not
   internally tied** — user photo of the GY-291's header shows `SDO` and
   `CS` both broken out individually (silkscreen: `SCL SDA SDO INT2 INT1
   CS VCC GND`). Neither is assumed pulled by the module. Wired
   explicitly in `circuits/esp8266_tilt_prototype/sensor_bus.py`: `SDO`→
   `GND` (address 0x53), `CS`→`3V3` (forces I2C mode, avoids a floating
   CMOS input). The board also has a printed X/Y/Z axis diagram — see
   `datasheets/GY-291_ADXL345_SUMMARY.md`.

## Hardware, likely resolved — one soldering step from confirmed

1. **D0-to-RST wake jumper.** ESP8266 only wakes from `ESP.deepSleep()`
   when GPIO16 (`D0`) pulses low into `RST`. **User's board has a
   silkscreened "SLEEP" solder-jumper pad next to `D0`**, visible on the
   back-side photo — this is almost certainly the manufacturer's
   provided provision for exactly this connection (a documented feature
   on genuine Wemos D1 Mini boards, not a guess). The pad **appears
   open/unbridged** in the photo. **Action: bridge it with a solder blob
   or a 0Ω resistor** rather than running a separate wire from `D0` to
   `RST` — cleaner and matches what the pad is there for. Confirm
   continuity between `D0` and `RST` with a multimeter after bridging,
   before relying on it. **If this isn't bridged, the board will sleep
   once and never wake — it will look like a dead/bricked unit, not a
   code bug.**

## Hardware, unverified — must check before relying on this rig

1. **A0's onboard divider, if any.** Some D1 Mini-family clones (not all)
   ship a fixed onboard divider on `A0` for reading `VIN`; a genuine
   Wemos D1 Mini does not. Verify with a multimeter (continuity from A0
   to anything other than the header pin) before trusting the 330k/100k
   external-divider math in `net_plan.md` — an unexpected onboard
   divider stacked with the external one would give a wrong reading, not
   a dangerous one (both paths only attenuate).

## TLS/RAM risk — now measured, not just theoretical

This sketch **compiles clean** against `esp8266:esp8266` core 3.1.2,
board `d1_mini` (verified with `arduino-cli compile`, exit 0, no
warnings). Real memory numbers from that build:

| Segment | Used | Total | % |
|---|---|---|---|
| RAM (globals: DATA+RODATA+BSS) | 33,740 B | 80,192 B | 42% |
| **IRAM** (hot-path code + cache) | **61,551 B** | 65,536 B | **93%** |
| Flash (IROM) | 400,652 B | 1,048,576 B | 38% |

Flash and static RAM have comfortable headroom. **IRAM does not** — only
~4KB free. IRAM holds the ESP8266 core's own hot-path functions (WiFi,
interrupt handlers, TLS inner loops) plus anything explicitly marked
`ICACHE_RAM_ATTR`; this sketch doesn't add any such attributes itself,
so 93% is essentially the core + library baseline for this feature set
(WiFi + BearSSL TLS + WebServer + DNSServer + OneWire), not something
introduced by the port. **Practical consequence: there is very little
room to add features to this sketch without hitting an IRAM overflow at
compile time** — a hard build failure, not a runtime mystery, so it will
be caught immediately if it happens. Not a problem for this sketch as
written.

What compiling does **not** verify: whether `WiFiClientSecure`'s BearSSL
handshake to Supabase actually succeeds at runtime under real free-heap
pressure (heap usage is dynamic/runtime, invisible to a static compile
report). That remains a real open question:

- If `WiFiClientSecure` handshakes fail or the device resets under
  memory pressure, try `client.setBufferSizes(512, 512)` before the
  connection (trades a stricter fragment size for RAM headroom).
- Treat the first several bench cycles as a soak test, watching the
  serial log for resets or malloc failures.

## Deliberately unchanged from the prototype doc's own guidance

- Battery divider left ungated (no Q1/Q2) — the doc's own stated
  rationale (breadboard sleep-current budget doesn't need it) applies
  identically to this ESP8266 build.
- MCP9808 not used — production-board-only part; this rig uses the
  DS18B20 fallback path, same as the ESP32 prototype guidance.
