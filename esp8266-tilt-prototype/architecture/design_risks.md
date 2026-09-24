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
3. ~~**D0-to-RST wake jumper.**~~ ✅ **Soldered by the user.** The
   "SLEEP" pad next to `D0` is now bridged. **Recommended before the
   first real deep-sleep cycle:** confirm continuity between `D0` and
   `RST` with a multimeter — a cold solder joint on this specific pad is
   indistinguishable from "never wakes" at the behavioral level.
4. ~~**A0's onboard divider.**~~ ✅ **Confirmed present** — user checked
   (inspection/multimeter) and found this specific clone has its own
   onboard divider on `A0`, ~220kΩ/100kΩ (ratio ≈0.3125), stepping a
   0-3.2V header signal down to 0-1.0V. Unlike a genuine Wemos D1 Mini
   (no onboard divider), this one has it — so the external divider was
   **redesigned as a two-stage system**: R1/R2 changed from
   330kΩ/100kΩ to **10kΩ/22kΩ**, targeting the board's ~3.2V header
   ceiling instead of the chip's 1.0V limit directly (the onboard
   divider now does that second stage). Firmware
   `BATTERY_DIVIDER_MULTIPLIER` updated from 4.3 to **4.6545** to match.
   Full derivation in `net_plan.md`. Re-verified: ERC still 0/0, firmware
   still compiles clean. **Calibrate against a multimeter early** — the
   onboard ratio was read off the board as "typically 220k/100k," not
   precision-measured, so the combined multiplier carries more
   uncertainty than a single-stage divider would.

5. **Temperature probe swapped: DS18B20 → MCP9808.** The DS18B20's
   TO-92 package was too bulky for a PCB-mounted build. Replaced with an
   MCP9808 I2C breakout (`MOD3`) sharing the GY-291's existing bus — no
   new GPIO, no new pull-up. **Wiring-only change:** the firmware already
   tries `mcp9808Begin()` before the DS18B20 fallback path in `setup()`,
   so no firmware edit was needed. One item to verify on whichever
   specific breakout is bought: its `A0`/`A1`/`A2` address pins default
   grounded (address `0x18`) — true on Adafruit #1782 and most clones,
   but confirm on the actual board, same spirit as the GY-291 `SDO`/`CS`
   check above. See `net_plan.md` and
   `datasheets/MCP9808_Breakout_SUMMARY.md`.

All five physical hardware items addressed in this document are now
resolved. Nothing hardware-side remains outstanding for this bench rig
beyond the recommended (not blocking) multimeter checks noted above.

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
