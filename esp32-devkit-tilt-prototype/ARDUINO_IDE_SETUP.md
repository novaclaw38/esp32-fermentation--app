# Bench rig: Arduino IDE setup and flashing

## What you need

The bench rig is an ESP32 Dev Kit V1 with a GY-291 accelerometer (ADXL345) and a DHT11 temperature sensor, flashed from the Arduino IDE. Gather these first.

**Hardware**

- ESP32 Dev Kit V1 (WROOM-32, 30-pin)
- GY-291 breakout (ADXL345)
- DHT11 (a 3-pin module, or a bare 4-pin sensor with a 10 kΩ pull-up to 3V3)
- Breadboard and jumper wires; solder the GY-291 wires if you can, since a loose jumper was the cause of the last tilt dropout
- A micro-USB **data** cable. A charge-only cable powers the board but never shows a serial port

**Values to have ready**

- WiFi name and password
- Your Supabase project URL and anon key
- The device ID (`ferm-monitor-002` for the current rig) and its device secret, which is shown only once when the device is created

**Sketches** (in `esp32-devkit-tilt-prototype/firmware/` in the repo)

| Sketch | Use it for |
| --- | --- |
| `fermentation_tilt_v1_esp32_devkit/fermentation_tilt_v1_esp32_devkit.ino` | The bench firmware. Reads temperature, humidity, tilt and battery, then posts to Supabase |
| `i2c_diagnostic/i2c_diagnostic.ino` | Wiring check for the accelerometer. Needs no libraries and no credentials |

The Hub sketch (`fermentation_monitor_v1`) is a different device. Don't flash it to this rig.

Before going further, open the bench sketch and look for `#define I2C_SCL 27`. If it says `19` or `22`, your copy is out of date: the I2C pins moved (SDA and SCL are now GPIO26 and GPIO27).

## Install the Arduino IDE and ESP32 support

Install Arduino IDE 2.x, then add the ESP32 board package. This is one-time setup per computer.

1. Download **Arduino IDE 2.x** from [arduino.cc/en/software](https://www.arduino.cc/en/software) and install it.
2. Open **File → Preferences** (on macOS: **Arduino IDE → Settings**). In **Additional boards manager URLs**, paste:

   ```
   https://espressif.github.io/arduino-esp32/package_esp32_index.json
   ```
3. Open **Tools → Board → Boards Manager** (or press the board icon in the left bar).
4. Search for **esp32** and install **esp32 by Espressif Systems**. It is a large download, so allow a few minutes.
5. Plug the board in with the data cable. On Windows or macOS, a USB driver may be needed if no serial port appears: most Dev Kit V1 boards use a CP2102 or CH340 chip, and the chip name is printed on the board.

The board package also provides `WiFi`, `HTTPClient`, `Preferences`, `Update` and `Wire`, which the sketch uses. Nothing else is needed for those.

## Install the libraries

The bench sketch needs two libraries, both for the DHT11. The ADXL345 needs none, because the sketch reads its registers directly through `Wire`.

1. Open **Sketch → Include Library → Manage Libraries…** (or press `Ctrl+Shift+I`).
2. Search for **DHT sensor library** and install the one **by Adafruit**.
3. When the IDE asks about dependencies, choose **Install all**. This adds **Adafruit Unified Sensor**.
4. Restart the IDE if a later compile still reports `DHT.h: No such file or directory`.

| Library | Author | Needed for |
| --- | --- | --- |
| DHT sensor library | Adafruit | DHT11 temperature and humidity |
| Adafruit Unified Sensor | Adafruit | Dependency of the DHT library |
| ADXL345 library | none | Not used. The sketch talks to the chip itself |

Other libraries with similar names ("DHT11", "DHTStable", "SimpleDHT") use different header files and will not satisfy `#include <DHT.h>`.

## Open the sketch and set your values

Open the bench sketch in the IDE. The folder must keep the same name as the sketch, `fermentation_tilt_v1_esp32_devkit`, or the IDE will offer to move it.

Edit the block headed `CONFIG: EDIT BEFORE FLASHING` near the top.

| Setting | Set it to |
| --- | --- |
| `SUPABASE_URL` | Your project URL, for example `https://eoebdquofjszlvsvkdfa.supabase.co` |
| `SUPABASE_ANON_KEY` | The project's anon (public) key |
| `DEVICE_ID` | `ferm-monitor-002` for the current rig. The repo default, `ferm-tilt-esp32-devkit-001`, does not match a claimed device |
| `DEVICE_SECRET` | The secret saved when the device was created. A wrong secret makes every reading fail |
| `WIFI_SSID`, `WIFI_PASSWORD` | Optional. See below |

**WiFi.** The compile-time `WIFI_SSID` and `WIFI_PASSWORD` are only a bench fallback. The normal route is the setup portal: on first boot, with no stored credentials, the board starts its own WiFi network named `FermentationMonitor-` followed by six characters. Join it from a phone, open the address the serial monitor prints, pick your network and save. The board restarts and remembers it.

**Leave these alone for now.** `OTA_ENABLED` is `false`, `CHARGE_DETECT_PIN` is `-1` (no charger wiring on this rig), and the temperature limits and sleep interval are overridden from the dashboard after the first successful contact.

Never commit your real URL, key or secret back to the repository.

## Check the wiring before you flash

The clock and data pins are not the usual ones: GPIO21 and GPIO22 are faulty on this board (GPIO23/GPIO19 were used briefly and then replaced), so the accelerometer uses GPIO26 (SDA) and GPIO27 (SCL). Find each pin by the GPIO number printed on your board, not by counting header positions, because Dev Kit V1 layouts vary by maker.

| Part | Pin | Connects to |
| --- | --- | --- |
| GY-291 | `SDA` | **GPIO26** |
| GY-291 | `SCL` | **GPIO27** |
| GY-291 | `VCC` | 3V3 |
| GY-291 | `CS` | 3V3 (keeps the chip in I2C mode) |
| GY-291 | `GND` | GND |
| GY-291 | `SDO` | GND (sets the I2C address to 0x53) |
| DHT11 | `DATA` | GPIO4 |
| DHT11 | `VCC` / `GND` | 3V3 / GND |
| Divider (optional, for battery) | middle point of two 100 kΩ resistors | GPIO34 |

Leave GPIO21 and GPIO22 unconnected.

A bare 4-pin DHT11 (pin order `VDD DATA NC GND`) needs a 10 kΩ resistor between `DATA` and 3V3. A 3-pin module already has one.

The battery divider is two 100 kΩ resistors in series from the cell's positive terminal (the TP4056 `B+` or `OUT+`, never the 3V3 pin) to GND, with GPIO34 on the join. Without it, the dashboard shows 0.00 V, which is harmless until you set a low-battery alert.

**Before powering up, with a multimeter:** 3.3 V between GY-291 `VCC` and GND, 3.3 V on `CS`, 0 V on `SDO`, and no beep (no short) between `SDA`, `SCL` and GND. Press the probe on the pin itself, not the wire, so a loose joint shows up.

## Choose the board and port, then upload

1. Connect the board by USB.
2. Open **Tools → Board → esp32** and choose **DOIT ESP32 DEVKIT V1**. **ESP32 Dev Module** also works.
3. Open **Tools → Port** and choose the new port: `COM3` or similar on Windows, `/dev/cu.usbserial-…` on macOS, `/dev/ttyUSB0` on Linux. If the list stays empty, see Troubleshooting.
4. Press **Verify** (the tick) first. A clean compile ends with the sketch size and no red text.
5. Press **Upload** (the arrow). When the console shows `Connecting…`, hold the **BOOT** button on the board until it starts writing, then release. Many Dev Kit V1 boards need this.
6. When it reports `Hard resetting via RTS pin`, the upload is done.
7. Open **Tools → Serial Monitor** and set the speed to **115200 baud**. Press the **EN** (reset) button to see boot output from the start.

If uploads fail partway, set **Tools → Upload Speed** to **115200** and try again.

## First boot: what the serial monitor should show

On a healthy first run the monitor prints these lines, in about this order:

```
--- Temp + Gravity module (ESP32 Dev Kit V1 bench build) waking up ---
WiFi connected: 192.168.x.x
Remote config applied: min=… max=… sleepSec=…
Temperature sensor: DHT11 (GPIO4)
Temperature: 22.00 C
Humidity: 48.0%
Tilt: 3.12 deg
Reading posted OK
Entering deep sleep for 900s
```

The exact numbers will differ. What matters is `WiFi connected`, a real `Tilt` value (not `unavailable`) and `Reading posted OK`.

**Check the tilt axis once.** Hold the assembled rig upright, with the GY-291's marked X axis vertical: the tilt should read near 0°. Lay it flat: near 90°. If it reads about 90° in both positions, the sketch is measuring along the wrong axis, and the comment above `readTiltDegrees()` says which line to change. Do this before any calibration, because a wrong axis makes every later reading meaningless.

**If the tilt is `unavailable`, test the accelerometer on its own.** Flash `i2c_diagnostic.ino` from the same folder (no libraries or credentials needed), open the monitor at 115200 and read the report. It repeats every 5 seconds, so you can wiggle wires and watch it change.

| The report says | Cause | Fix |
| --- | --- | --- |
| `0x53 DEVID = 0xE5 (ADXL345 confirmed)` and a z value near 1 g | The accelerometer is fine | Flash the main sketch again |
| Answers only on "SDA/SCL swapped" | The two wires are crossed | Swap them |
| Answers on "previous wiring" or "original pins" | A wire is still on GPIO23, GPIO19, GPIO22 or GPIO21 | Move SDA to GPIO26 and SCL to GPIO27 |
| Found at `0x1D` instead of `0x53` | `SDO` is not reaching GND | Wire `SDO` to GND |
| Nothing answers, lines idle HIGH | No power, or `CS` not on 3V3 | Check `VCC`, `GND`, `CS` |
| A line reads LOW | Short to ground or a bad pad | Check that wire and its joint |

## Confirm readings reach the dashboard, then calibrate

Open the dashboard and the device's page. A reading with temperature, tilt, battery and humidity should appear after the first wake. The board then sleeps for its interval, 900 seconds by default.

Until the device is calibrated, the dashboard shows the **raw tilt angle** in degrees, not gravity. The trend is real (tilt falls as the liquid thins) but the numbers are not specific gravity.

**To calibrate**

1. Float the module in plain water, which is 1.000, and note the tilt angle from the serial monitor or the dashboard.
2. Repeat in one or two sugar solutions whose gravity you measured with a hydrometer, noting the tilt for each.
3. Fit a curve through the points: gravity = a·tilt³ + b·tilt² + c·tilt + d. A straight line (a and b set to 0) is enough with only two or three points. The procedure is in `firmware/README.md`.
4. Enter a, b, c and d under the device's **Settings → Setup → Gravity calibration**, with the temperature the samples were at.

Once saved, the gravity dial, ABV and fermentation stage appear, and the whole history converts at once.

If you attach a battery, also set **Low-battery alert (volts)** on that page, for example 3.4. Leave it blank on USB power, because with no cell attached the reading is noise.

## Troubleshooting

Find the line in the compile console or serial monitor, then match it here.

| You see | Likely cause | Fix |
| --- | --- | --- |
| `DHT.h: No such file or directory` | DHT library not installed | Install **DHT sensor library** by Adafruit; restart the IDE |
| `Adafruit_Sensor.h: No such file` | Dependency missing | Install **Adafruit Unified Sensor** |
| No port in **Tools → Port** | Charge-only cable, or no USB driver | Try a data cable; install the CP210x or CH340 driver for your board |
| `Connecting…` never finishes, or "Wrong boot mode" | Board not in download mode | Hold **BOOT** while it connects, release when it writes |
| Upload fails partway | Upload speed too high | **Tools → Upload Speed** to 115200 |
| `Tilt: unavailable` with `ADXL345 not responding on I2C` | Loose jumper or wrong pins | Reseat every GY-291 wire, check the wiring table, run `i2c_diagnostic` |
| `ADXL345 DEVID mismatch` | A different chip, or a bad module | Try another GY-291 |
| `Discarding tilt: ... module likely disturbed` | The rig was being moved during the read | Hold it still; it clears on the next wake |
| `Error: could not read DHT11` | Wiring on GPIO4, or missing pull-up | Check `DATA` on GPIO4 and the 10 kΩ pull-up on a bare sensor |
| `Reading POST failed` or `get_device_config failed` | Wrong URL, anon key, device ID or secret, or no network | Recheck the five config values; confirm `WiFi connected` printed |
| Battery shows 0.00 V | Voltage divider not fitted | Fit the two 100 kΩ resistors, or ignore on USB |
| Temperature or humidity wrong by a few degrees | DHT11 accuracy is ±2 °C | Expected; it is an air sensor for bench testing |

If none of these fits, copy the first error line, not the last. The first one is usually the real cause.
