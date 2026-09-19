# Net Plan — ESP8266 D1 Mini Bench Prototype

| Net | Type | Connected parts |
|---|---|---|
| `VBUS_5V` | Power, 5V | Micro-USB J1 → TP4056 breakout VIN |
| `BAT_PLUS` | Power, 3.0-4.2V | TP4056 breakout `B+` → 18650 cell `+`; TP4056 breakout `OUT+` → D1 Mini `5V` pin; also → R1 (battery-sense divider top, 10kΩ) |
| `BAT_MINUS`/`GND` | Power, 0V | Common ground — TP4056 breakout `B-`/`OUT-`, 18650 `-`, D1 Mini `GND`, GY-291 `GND`, DS18B20 `GND`, R2 bottom |
| `D1MINI_5V` | Power | = TP4056 `OUT+` (see BAT_PLUS — same node, D1 Mini's onboard regulator runs from this) |
| `D1MINI_3V3` | Power, regulated | D1 Mini `3V3` pin (output of its onboard LDO) → GY-291 `VCC`, DS18B20 `VCC`, R3 pull-up top |
| `SDA` | I2C | D1 Mini `D2` (GPIO4) → GY-291 `SDA` |
| `SCL` | I2C | D1 Mini `D1` (GPIO5) → GY-291 `SCL` |
| `SDO` | Signal | GY-291 `SDO` → `GND` — **required** to get I2C address 0x53. Confirmed as its own dedicated header pin on the user's board (photo), not internally tied |
| `CS` | Signal | GY-291 `CS` → `3V3` — also confirmed as its own dedicated header pin, same as SDO. Wired explicitly rather than left floating (see `datasheets/GY-291_ADXL345_SUMMARY.md`) |
| `ONE_WIRE` | Signal | D1 Mini `D6` (GPIO12) → DS18B20 `DATA`, R3 (4.7kΩ pull-up to 3V3, only if the probe lacks one built in) |
| `BATT_SENSE_ADC` | Signal, analog | R1 (10kΩ) from `BAT_PLUS` → node → R2 (22kΩ) → `GND`; node → D1 Mini `A0` header pin (which then feeds the board's own onboard divider before reaching the chip — see the two-stage note below) |
| `D0_RST_JUMPER` | — | D1 Mini `D0` (GPIO16) → D1 Mini `RST`. **User's board has a labeled "SLEEP" solder-jumper pad next to `D0`** (photo of the board's back) — the manufacturer-provided provision for exactly this connection. ✅ **Soldered/bridged by the user.** Recommended: confirm continuity with a multimeter before the first real deep-sleep cycle. |

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

## Divider ratio — TWO stages on this specific board, not one

The production PCB uses a single 1:1 100k/100k divider because the
ESP32's ADC accepts 0-3.3V directly. ESP8266's chip-level ADC accepts
only **0-1.0V**, and — confirmed by the user (inspection/multimeter) —
**this specific D1 Mini clone already has its own onboard divider on
`A0`** (~220kΩ/100kΩ, ratio ≈0.3125) between the header pin and the
chip, stepping a 0-3.2V header signal down to 0-1.0V. A genuine Wemos D1
Mini has no such onboard divider; this clone does.

That means the external divider (R1/R2) only needs to bring `BAT_PLUS`
down to the header pin's ~3.2V ceiling, not all the way to 1.0V — the
board does the second stage itself:

```
header_V = BAT_PLUS × R2/(R1+R2)          -- external divider (this project)
chip_V   = header_V × 100k/(220k+100k)    -- board's own onboard divider
         = header_V × 0.3125
```

With **R1 = 10kΩ, R2 = 22kΩ**: `R2/(R1+R2) = 0.6875`. At a 4.2V max
cell: `header_V = 2.89V` (margin under the board's ~3.2V input ceiling),
`chip_V = 0.90V` (margin under the ADC's 1.0V limit, and uses ~90% of
the 10-bit range for good resolution).

Combined firmware multiplier undoes both stages:
`(R1+R2)/R2 × (220k+100k)/100k = (32/22) × 3.2 ≈ 4.6545` — see
`firmware/fermentation_tilt_v1_esp8266/`'s `BATTERY_DIVIDER_MULTIPLIER`.

**Calibration matters more here than on a single-stage divider** — the
onboard ratio was read off the board as "typically 220k/100k," not
precision-measured. Check an early reading against a multimeter and
adjust the multiplier if it's consistently off, same as the production
board's own calibration caveat.
