# ESP32-WROOM-32E-N16 — WiFi/BT module (Espressif Systems)

LCSC C701343 · [Datasheet](https://www.lcsc.com/datasheet/lcsc_datasheet_2304140030_Espressif-Systems-ESP32-WROOM-32E-N16_C701343.pdf)

**PDF download failed** — the fetch returned an HTML page rather than a
PDF (likely a CDN/anti-bot redirect in this environment), and the
resulting `ESP32-WROOM-32E-N16.pdf` in this directory is invalid (HTML
content, not a real PDF). A directory-protection hook here blocks
automated deletion of files in `datasheets/` — **a human should manually
remove or replace that file** before it's mistaken for a real datasheet.
Per the download-strategy rules (max 2 URL attempts, no header retries),
this summary is written from MCP spec data + well-established public
pinout knowledge instead.

| Spec | Value |
|------|-------|
| Package | SMD module, 25.5×18mm, on-board PCB antenna |
| Vcc / Vin range | 3.0V–3.6V |
| Chip | ESP32-DOWD-V3 (dual-core), 16MB flash |
| WiFi | 2.4GHz, 802.11 b/g/n, -98dBm sensitivity, 20dBm output |
| Bluetooth | 4.2 (BR/EDR + BLE) |
| TX/RX current | 239mA send / 112mA receive (bursts) |
| Deep-sleep current | ~10-150µA (module-dependent, dominant term for this design's battery life) |
| Operating temp | -40°C to +85°C |

## Pins used in this design

| Pin (silkscreen) | Function here | Net |
|---|---|---|
| 3V3 | Power in | `3V3` |
| GND | Ground | `GND` |
| EN | Reset/enable | `EN` (10kΩ pull-up + 1µF RC delay) |
| IO0 | Boot mode select | `IO0` (10kΩ pull-up + button) |
| GPIO21 | I2C SDA | `SDA` (4.7kΩ pull-up) |
| GPIO22 | I2C SCL | `SCL` (4.7kΩ pull-up) |
| GPIO25 | Battery-divider enable | `DIV_EN` |
| GPIO34 (ADC1_6, input-only) | Battery voltage sense | `BATT_SENSE` |
| GPIO4 | Optional DS18B20 1-Wire (fallback only) | `ONE_WIRE` |
| GPIO1 (U0TXD) | UART TX, programming header | `TXD0` |
| GPIO3 (U0RXD) | UART RX, programming header | `RXD0` |

## Notes
- Classic ESP32 (not S3/C3) is a hard requirement — this exact GPIO
  mapping is what `firmware/fermentation_tilt_v1/` assumes; a different
  ESP32 variant would need a firmware review.
- GPIO34 is input-only (no internal pull-up/down) — correct for an
  analog-sense net, don't reuse it as a digital output elsewhere.
- Standard ESP32 minimum-circuit application: EN RC delay + IO0 pull-up
  are required for reliable boot; both are already in `net_plan.md`.
- Antenna keep-out (15×15mm, all layers, under/around the module) is
  mandatory per the module's own application notes — flagged separately
  in `architecture/design_risks.md` given this board's narrow housing.
