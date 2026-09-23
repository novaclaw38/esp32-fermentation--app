# ESP32 Dev Kit V1 (30-pin, ESP32-WROOM-32) — Module Reference

Generic breakout board reference — "Dev Kit V1" isn't a single
manufacturer's product, it's a widely-cloned form factor (DOIT ESP32
DEVKIT V1 is the most common origin). The underlying module
(ESP32-WROOM-32) and its GPIO numbering are standardized; the specific
breakout board's silkscreen layout is not always identical across
vendors.

| Spec | Value |
|------|-------|
| MCU | ESP32-WROOM-32 (dual-core Xtensa LX6, WiFi + BT) |
| Flash | Typically 4MB |
| ADC | 12-bit, SAR, two independent ADC units (ADC1: 8 channels, ADC2: 10 channels — ADC2 conflicts with WiFi, avoid for readings taken with WiFi active) |
| Logic level | 3.3V (**not** 5V tolerant on GPIOs) |
| USB | Micro-USB, onboard CP2102 or CH340 USB-serial (varies by clone) |
| Onboard regulator | Typically AMS1117-3.3 (varies) — check current rating if powering hungry peripherals off `3V3` |

## Pins used by this design (locate by GPIO label on your specific board)

| Label | Function here | Notes |
|---|---|---|
| `VIN` (or `5V`) | TP4056 `OUT+` | Cell voltage in, ahead of the onboard regulator |
| `3V3` | GY-291 `VCC`/`CS`, MCP9808 `VDD` | Regulated output — confirm current headroom is adequate for two small I2C breakouts (it is; both draw low mA) |
| `GND` | Common ground | Multiple GND pins usually broken out — any works |
| `GPIO21` | I2C `SDA` | Matches the production board's own I2C pin choice |
| `GPIO22` | I2C `SCL` | Matches the production board's own I2C pin choice |
| `GPIO25` | `BATTERY_EN_PIN` | Toggled for structural parity with the production/ESP8266 firmware; drives nothing physical on this ungated build |
| `GPIO34` | Battery-sense ADC | **Input-only pin** (no internal pull-up/down, can't be used as an output) — matches the production board's own choice, deliberately picked for exactly this reason |
| `GPIO4` | DS18B20 1-Wire (fallback sensor only) | Only wire this if testing the DS18B20 fallback path; unused if only the MCP9808 is fitted |

## Boot-strapping pins — avoid for anything else on this design

Standard ESP32 caveat, listed for completeness even though this design
doesn't use any of them: `GPIO0`, `GPIO2`, `GPIO12`, `GPIO15` affect
boot mode / flash voltage selection and should be left alone unless you
know what you're doing. `GPIO6`-`GPIO11` are wired to the module's
internal flash and are not broken out for general use on any WROOM-32
board.

## The one real gotcha for this project specifically

**Physical pin position on a 30-pin breakout is not standardized across
vendors**, even though the GPIO numbers printed next to each pin are
authoritative and consistent (they come from the WROOM-32 module
itself, not the breakout PCB). Always wire by matching the printed
`GPIOxx` label, never by counting position from a generic pinout
diagram found online — a different clone's `3V3` pin can sit in a
different physical slot than another's. No photo of the actual board
used for this build has been provided yet; verify against it directly.
