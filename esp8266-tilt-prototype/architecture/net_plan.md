# Net Plan — ESP8266 D1 Mini Bench Prototype

| Net | Type | Connected parts |
|---|---|---|
| `VBUS_5V` | Power, 5V | Micro-USB J1 → TP4056 breakout VIN |
| `BAT_PLUS` | Power, 3.0-4.2V | TP4056 breakout `B+` → 18650 cell `+`; TP4056 breakout `OUT+` → D1 Mini `5V` pin; also → R1 (battery-sense divider top) |
| `BAT_MINUS`/`GND` | Power, 0V | Common ground — TP4056 breakout `B-`/`OUT-`, 18650 `-`, D1 Mini `GND`, GY-291 `GND`, DS18B20 `GND`, R2 bottom |
| `D1MINI_5V` | Power | = TP4056 `OUT+` (see BAT_PLUS — same node, D1 Mini's onboard regulator runs from this) |
| `D1MINI_3V3` | Power, regulated | D1 Mini `3V3` pin (output of its onboard LDO) → GY-291 `VCC`, DS18B20 `VCC`, R3 pull-up top |
| `SDA` | I2C | D1 Mini `D2` (GPIO4) → GY-291 `SDA` |
| `SCL` | I2C | D1 Mini `D1` (GPIO5) → GY-291 `SCL` |
| `SDO` | Signal | GY-291 `SDO` → `GND` — **required** to get I2C address 0x53 (many GY-291 clones float/pull this high otherwise, giving 0x1D) |
| `ONE_WIRE` | Signal | D1 Mini `D6` (GPIO12) → DS18B20 `DATA`, R3 (4.7kΩ pull-up to 3V3, only if the probe lacks one built in) |
| `BATT_SENSE_ADC` | Signal, analog | R1 (330kΩ) from `BAT_PLUS` → node → R2 (100kΩ) → `GND`; node → D1 Mini `A0` |
| `D0_RST_JUMPER` | — | D1 Mini `D0` (GPIO16) → D1 Mini `RST` — **hardwire required for `ESP.deepSleep()` to ever wake the board.** Verify whether the specific board already bridges this before adding a wire. |

## Deliberately NOT populated (vs. the production board)

- **No Q1/Q2 gating transistors** on the battery divider — ungated, per
  `hardware/PROTOTYPE_TEMP_GRAVITY.md`'s explicit guidance for
  breadboard builds. `BATTERY_EN_PIN` (`D7`/GPIO13) is still toggled by
  firmware for structural parity with the production sketch, but is
  left unconnected on this build (`NC`).
- **No MCP9808** — production-board-only part. This bench build uses the
  DS18B20 fallback path the firmware already supports.
- **`D3` (GPIO0), `D4` (GPIO2), `D8` (GPIO15)** — ESP8266 boot-strapping
  pins, deliberately left unconnected.

## Divider ratio — differs from the production board

The production PCB uses a 1:1 100k/100k divider because the ESP32's ADC
accepts 0-3.3V. ESP8266's `A0` accepts only **0-1.0V**. At a max cell
voltage of 4.2V, a 330k/100k divider gives `100/(330+100) = 0.2326`,
i.e. 0.977V at 4.2V — under the 1.0V limit with margin. Firmware
multiplier changes from `×2.0` (production) to `×4.3` accordingly (see
`firmware/fermentation_tilt_v1_esp8266/`).
