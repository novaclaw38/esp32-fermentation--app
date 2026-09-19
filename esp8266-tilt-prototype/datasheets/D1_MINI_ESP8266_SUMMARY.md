# Wemos D1 Mini (ESP8266) — Pin Reference

No PDF datasheet fetch attempted — this is a widely-standardized
hobbyist board pinout, confirmed directly against the user's photo of
their actual board (silkscreen matches the genuine Wemos layout exactly,
including "D1 mini" text and "4MB" flash label).

| Spec | Value |
|------|-------|
| MCU | ESP8266 (ESP-12F module) |
| Flash | 4MB |
| Vin (USB) | 5V, via micro-USB (flashing/power) |
| Onboard regulator | ME6211-class 3.3V LDO, ~0.1-0.3V dropout — runs from either USB 5V or the `5V` header pin down to a ~3.4-3.6V source |
| WiFi | 2.4GHz only (no 5GHz radio) |
| ADC | **One pin, `A0`. 10-bit. 0-1.0V range** — not 0-3.3V |

## Pinout (silkscreen → GPIO)

| Silkscreen | GPIO | Notes / boot behavior |
|---|---|---|
| `D0` | GPIO16 | **No PWM/interrupt support.** The *only* pin that can drive `RST` to wake from deep sleep — must be wired to `RST` for `ESP.deepSleep()` to ever return |
| `D1` | GPIO5 | General purpose — conventional I2C SCL pin on this board family |
| `D2` | GPIO4 | General purpose — conventional I2C SDA pin on this board family |
| `D3` | GPIO0 | **Boot-strapping pin** — must be HIGH at boot (onboard pull-up). Avoid driving LOW at power-on |
| `D4` | GPIO2 | **Boot-strapping pin** — must be HIGH at boot. Also drives the onboard blue LED (active-low) on most clones |
| `D5` | GPIO14 | General purpose (SPI CLK if using SPI) |
| `D6` | GPIO12 | General purpose (SPI MISO if using SPI) |
| `D7` | GPIO13 | General purpose (SPI MOSI if using SPI) |
| `D8` | GPIO15 | **Boot-strapping pin** — must be LOW at boot (onboard pull-down on most clones). Avoid driving HIGH externally at power-on |
| `A0` | ADC | 10-bit, 0-1.0V input range only — exceeding 1.0V risks the ADC pin, always use an external divider for anything above that |
| `RST` | EXT_RSTB | Reset — also the deep-sleep wake target for `D0` |
| `3V3` | 3V3 | Regulated output from the onboard LDO |
| `5V` | 5V | Input to the onboard LDO (also present when powered via USB) |
| `GND` | GND | — |
| `TX`/`RX` | GPIO1/GPIO3 | UART0 — used by the USB-serial chip when flashing; avoid using as general I/O while also flashing over USB |

## Notes

- This board's pin labels (`D0`-`D8`) are a silkscreen convention, not
  Arduino digital-pin numbers — always use the GPIO number in code
  (`D1` = `5`, not `1`), or the Arduino ESP8266 core's `D1`/`D2`/... 
  macros if using the board manager's Wemos D1 Mini board definition
  (which map correctly to the GPIO numbers above).
- Deep sleep max duration is bounded by a 32-bit microsecond counter —
  roughly 71.5 minutes. Irrelevant at this project's 900s (15 min)
  default interval, but would matter if `SLEEP_INTERVAL_SECONDS` were
  ever pushed past ~71 minutes from the dashboard.
