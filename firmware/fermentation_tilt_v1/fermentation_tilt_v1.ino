/*
  Fermentation Monitor - Temp + Gravity Module Firmware (v1)
  -----------------------------------------------------------
  Hardware: ESP32-WROOM-32E + ADXL345 (I2C) + DS18B20 (potted, GPIO4)
  See hardware/schematic-gravity-module.html and MULTI_SENSOR_MODULES.md.

  This is a SEPARATE sketch from fermentation_monitor_v1.ino, not a variant
  of it. Same Supabase RPCs, same boot/power patterns, different sensors:

    - DS18B20 potted against the housing wall (no external probe connector)
      gives a real temperature reading, not just tilt compensation -- this
      one device covers temperature AND gravity.
    - ADXL345 gives the tilt angle the device floats at. Specific gravity
      is NOT computed here: this posts the raw angle, and the backend
      applies the per-device calibration curve (see the readings_with_gravity
      view). That way recalibrating fixes a device's whole history instead
      of baking a wrong curve into stored rows.

  Behavior each wake cycle:
    1. Wake from deep sleep
    2. Read DS18B20 + average N accelerometer samples -> tilt angle
    3. Connect to WiFi
    4. Fetch remote config (thresholds, sleep interval) via get_device_config
    5. POST {temperature, tilt, battery} via the ingest_reading() RPC
    6. Check temperature against thresholds; alert via ingest_alert() after
       CONSECUTIVE_BREACH_LIMIT consecutive breaches
    7. Occasionally check for an OTA update
    8. Deep sleep again

  Replace all CONFIG placeholders below before flashing.
*/

#include <Wire.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <HTTPUpdate.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// ---------------------- CONFIG: EDIT BEFORE FLASHING ----------------------

const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

const char* SUPABASE_URL      = "https://YOUR_PROJECT.supabase.co";
const char* SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

// Unique per physical unit. Create the row with device_type = 'tilt' so the
// dashboard knows to show gravity for it.
const char* DEVICE_ID     = "ferm-tilt-001";
const char* DEVICE_SECRET = "YOUR_PER_DEVICE_SECRET";

// First-boot fallbacks only -- the values stored in Supabase win once the
// device has fetched its config at least once.
float TEMP_MIN_C = 18.0;
float TEMP_MAX_C = 24.0;
int CONSECUTIVE_BREACH_LIMIT = 3;

// Gravity moves slowly; there's no value in sampling it as often as
// temperature. 900s = 15 min. Server-configurable.
uint64_t SLEEP_INTERVAL_SECONDS = 900;

const unsigned long WIFI_TIMEOUT_MS = 15000;

// --- OTA ---
const bool OTA_ENABLED = false;
const char* OTA_MANIFEST_URL = "https://YOUR_PROJECT.supabase.co/storage/v1/object/public/firmware/manifest.json";
const int FIRMWARE_VERSION = 1;
const int OTA_CHECK_EVERY_N_CYCLES = 96; // ~once/day at a 15 min interval

// ---------------------------- PINS / HARDWARE ------------------------------

#define ONE_WIRE_BUS   4    // DS18B20 data (4.7k pull-up to 3V3)
#define I2C_SDA        21
#define I2C_SCL        22
#define BATTERY_ADC_PIN 34  // ADC1_CH6, input-only
#define BATTERY_EN_PIN 25   // drives Q2, which switches Q1 (the divider's gate)

// ADXL345 (SDO tied to GND on this board -> address 0x53)
const uint8_t ADXL345_ADDR        = 0x53;
const uint8_t ADXL345_REG_DEVID   = 0x00;
const uint8_t ADXL345_REG_POWER   = 0x2D;
const uint8_t ADXL345_REG_FORMAT  = 0x31;
const uint8_t ADXL345_REG_DATAX0  = 0x32;
const uint8_t ADXL345_DEVID_VALUE = 0xE5;

// MCP9808 temperature sensor -- the preferred part on the production board.
// It shares the ADXL345's I2C bus, so it costs no extra GPIO and no 1-Wire
// pull-up, and at +-0.25 C it is twice as accurate as a DS18B20 for less
// money. A0/A1/A2 tied low gives 0x18.
//
// Placement decides accuracy far more than the datasheet does: a +-0.25 C part
// reading the enclosure's internal air is worse than a +-0.5 C part bonded to
// the housing wall. Whichever sensor is fitted has to be thermally coupled to
// the wall, not left sitting in still air on the board.
const uint8_t MCP9808_ADDR         = 0x18;
const uint8_t MCP9808_REG_CONFIG   = 0x01;
const uint8_t MCP9808_REG_AMBIENT  = 0x05;
const uint8_t MCP9808_REG_MANUF_ID = 0x06;
const uint16_t MCP9808_MANUF_ID    = 0x0054;
const uint8_t MCP9808_REG_RESOLUTION = 0x08;

// Full-resolution mode is 3.9 mg per LSB regardless of range (256 LSB/g).
const float ADXL345_G_PER_LSB = 0.0039;

// The liquid sloshes and the module bobs; a single sample is noisy. Averaging
// a short burst costs a few ms and takes most of that out.
const int TILT_SAMPLE_COUNT = 24;
const int TILT_SAMPLE_DELAY_MS = 10;

// ---------------------------------------------------------------------------

OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

// Which temperature sensor was actually found this boot. The production board
// carries an MCP9808; bench rigs are usually wired with a DS18B20 probe. Rather
// than a compile-time switch that someone will forget to flip, probe for the
// MCP9808 and fall back -- so one binary runs on both.
bool mcp9808Present = false;

RTC_DATA_ATTR int consecutiveBreaches = 0;
RTC_DATA_ATTR bool alertActive = false;
RTC_DATA_ATTR uint32_t cycleCount = 0;

void goToSleep() {
  // Leave the battery divider disabled. R6 pulls Q1's gate to BAT+ whenever
  // Q2 isn't driven, so the divider is already off by default through sleep --
  // this just makes it explicit rather than relying on the pin's sleep state.
  digitalWrite(BATTERY_EN_PIN, LOW);

  Serial.println("Entering deep sleep for " + String((unsigned long)SLEEP_INTERVAL_SECONDS) + "s");
  Serial.flush();
  esp_sleep_enable_timer_wakeup(SLEEP_INTERVAL_SECONDS * 1000000ULL);
  esp_deep_sleep_start();
}

bool connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long start = millis();
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - start > WIFI_TIMEOUT_MS) {
      Serial.println("\nWiFi connect timed out");
      return false;
    }
    delay(250);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected: " + WiFi.localIP().toString());
  return true;
}

// --- MCP9808 -------------------------------------------------------------

void mcp9808Write16(uint8_t reg, uint16_t value) {
  Wire.beginTransmission(MCP9808_ADDR);
  Wire.write(reg);
  Wire.write((uint8_t)(value >> 8));
  Wire.write((uint8_t)(value & 0xFF));
  Wire.endTransmission();
}

bool mcp9808Read16(uint8_t reg, uint16_t* out) {
  Wire.beginTransmission(MCP9808_ADDR);
  Wire.write(reg);
  if (Wire.endTransmission() != 0) return false;
  Wire.requestFrom((uint8_t)MCP9808_ADDR, (uint8_t)2);
  if (Wire.available() < 2) return false;
  uint8_t hi = Wire.read();
  uint8_t lo = Wire.read();
  *out = ((uint16_t)hi << 8) | lo;
  return true;
}

// Returns true if a real MCP9808 answered. The manufacturer ID is checked
// rather than just the ACK, so another device sitting at 0x18 can't be
// mistaken for one.
bool mcp9808Begin() {
  Wire.begin(I2C_SDA, I2C_SCL);

  uint16_t manuf;
  if (!mcp9808Read16(MCP9808_REG_MANUF_ID, &manuf)) return false;
  if (manuf != MCP9808_MANUF_ID) {
    Serial.println("Device at 0x18 is not an MCP9808 (manuf 0x" + String(manuf, HEX) + ")");
    return false;
  }

  // 0x03 = 0.0625 C resolution. The slowest setting at ~250 ms, which is
  // irrelevant once per wake and gives the part's full accuracy.
  Wire.beginTransmission(MCP9808_ADDR);
  Wire.write(MCP9808_REG_RESOLUTION);
  Wire.write(0x03);
  Wire.endTransmission();

  mcp9808Write16(MCP9808_REG_CONFIG, 0x0000); // continuous conversion
  return true;
}

// ~200 uA running vs ~0.1 uA shut down. Trivial while awake, but this board is
// asleep 99.5% of the time, so leaving it converting would cost more over a
// day than every reading it takes.
void mcp9808Sleep() {
  mcp9808Write16(MCP9808_REG_CONFIG, 0x0100); // SHDN
}

float mcp9808ReadC() {
  delay(260); // one full conversion at 0.0625 C resolution

  uint16_t raw;
  if (!mcp9808Read16(MCP9808_REG_AMBIENT, &raw)) {
    Serial.println("Error: MCP9808 ambient read failed");
    return NAN;
  }

  // 13-bit two's complement in bits 12:0; bits 15:13 are alert flags.
  float tempC = (raw & 0x0FFF) / 16.0;
  if (raw & 0x1000) tempC -= 256.0;
  return tempC;
}

// --- DS18B20 fallback ----------------------------------------------------

float ds18b20ReadC() {
  sensors.requestTemperatures();
  float tempC = sensors.getTempCByIndex(0);

  if (tempC == DEVICE_DISCONNECTED_C) {
    Serial.println("Error: could not read DS18B20 (check the sensor's solder joints)");
    return NAN;
  }
  return tempC;
}

// Prefers the MCP9808 when one is fitted; falls back to a DS18B20 otherwise.
// `mcp9808Present` is set during setup().
float readTemperature() {
  if (mcp9808Present) {
    float tempC = mcp9808ReadC();
    mcp9808Sleep();
    return tempC;
  }
  return ds18b20ReadC();
}

// Reads battery voltage through the gated 100k/100k divider. The divider is
// only powered while this runs -- see hardware/PCB_DESIGN.md for why it isn't
// left free-running (it would draw more than the ESP32's own deep-sleep current).
float readBatteryVoltage() {
  digitalWrite(BATTERY_EN_PIN, HIGH);
  // C7 (0.1uF) sits on the ADC node against a 50k Thevenin source, so tau is
  // ~5ms. Reading immediately would return a still-charging node, i.e. a
  // falsely low battery. 30ms is ~6 tau.
  delay(30);

  int raw = analogRead(BATTERY_ADC_PIN);

  digitalWrite(BATTERY_EN_PIN, LOW);

  // x2 undoes the 1:1 divider. The ESP32's ADC is nonlinear near its rails,
  // so treat this as a low-battery warning, not a fuel gauge -- calibrate the
  // multiplier against a multimeter on the first unit.
  return (raw / 4095.0) * 3.3 * 2.0;
}

// --------------------------- ADXL345 (inline) ------------------------------
// Small enough not to justify a library dependency; all we need is a presence
// check, a mode set, and one burst read of the six data registers.

void adxlWrite(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(ADXL345_ADDR);
  Wire.write(reg);
  Wire.write(value);
  Wire.endTransmission();
}

bool adxlBegin() {
  Wire.begin(I2C_SDA, I2C_SCL);

  Wire.beginTransmission(ADXL345_ADDR);
  Wire.write(ADXL345_REG_DEVID);
  if (Wire.endTransmission() != 0) {
    Serial.println("ADXL345 not responding on I2C");
    return false;
  }
  Wire.requestFrom((uint8_t)ADXL345_ADDR, (uint8_t)1);
  if (!Wire.available()) {
    Serial.println("ADXL345 DEVID read returned nothing");
    return false;
  }
  uint8_t devid = Wire.read();
  if (devid != ADXL345_DEVID_VALUE) {
    Serial.println("ADXL345 DEVID mismatch: got 0x" + String(devid, HEX));
    return false;
  }

  adxlWrite(ADXL345_REG_FORMAT, 0x08); // full resolution, +/-2g
  adxlWrite(ADXL345_REG_POWER, 0x08);  // measure mode
  delay(20);                           // let the first samples settle
  return true;
}

// Back to standby (~0.1uA vs ~40uA measuring). Small next to the radio, but
// this thing is meant to sit in a fermenter for weeks.
void adxlSleep() {
  adxlWrite(ADXL345_REG_POWER, 0x00);
}

bool adxlReadRaw(int16_t* x, int16_t* y, int16_t* z) {
  Wire.beginTransmission(ADXL345_ADDR);
  Wire.write(ADXL345_REG_DATAX0);
  if (Wire.endTransmission() != 0) return false;

  Wire.requestFrom((uint8_t)ADXL345_ADDR, (uint8_t)6);
  if (Wire.available() < 6) return false;

  uint8_t b[6];
  for (int i = 0; i < 6; i++) b[i] = Wire.read();

  *x = (int16_t)((b[1] << 8) | b[0]);
  *y = (int16_t)((b[3] << 8) | b[2]);
  *z = (int16_t)((b[5] << 8) | b[4]);
  return true;
}

// Tilt angle of the module's long axis away from vertical:
//   0 deg  = floating perfectly upright
//   90 deg = lying flat
// A fermenting sample typically sits somewhere in the 25-75 deg band and
// migrates as density drops.
//
// AXIS ASSUMPTION: the board's X axis runs along the housing's long axis.
// Confirm this on the bench before trusting a calibration -- hold the module
// upright and check this prints near 0, then lay it flat and check it prints
// near 90. If it's inverted or stuck near 90, swap which of x/y/z is treated
// as the long axis below.
float readTiltDegrees() {
  double sumX = 0, sumY = 0, sumZ = 0;
  int good = 0;

  for (int i = 0; i < TILT_SAMPLE_COUNT; i++) {
    int16_t x, y, z;
    if (adxlReadRaw(&x, &y, &z)) {
      sumX += x;
      sumY += y;
      sumZ += z;
      good++;
    }
    delay(TILT_SAMPLE_DELAY_MS);
  }

  if (good == 0) {
    Serial.println("Error: no usable ADXL345 samples");
    return NAN;
  }

  double ax = (sumX / good) * ADXL345_G_PER_LSB;
  double ay = (sumY / good) * ADXL345_G_PER_LSB;
  double az = (sumZ / good) * ADXL345_G_PER_LSB;

  double magnitude = sqrt(ax * ax + ay * ay + az * az);
  // At rest the only acceleration should be gravity. Anything far off 1g means
  // the module was being handled or knocked -- that reading would produce a
  // bogus angle, so discard it rather than post a phantom gravity swing.
  if (magnitude < 0.80 || magnitude > 1.20) {
    Serial.println("Discarding tilt: |a| = " + String(magnitude, 3) +
                   "g, module likely disturbed");
    return NAN;
  }

  double tilt = atan2(sqrt(ay * ay + az * az), fabs(ax)) * 180.0 / PI;
  return (float)tilt;
}

// ------------------------------ Supabase -----------------------------------

bool extractNumberField(const String& json, const char* key, float* out) {
  String needle = "\"" + String(key) + "\":";
  int idx = json.indexOf(needle);
  if (idx == -1) return false;
  int start = idx + needle.length();
  int end = start;
  while (end < (int)json.length() &&
         (isDigit(json[end]) || json[end] == '-' || json[end] == '.')) {
    end++;
  }
  if (end == start) return false;
  *out = json.substring(start, end).toFloat();
  return true;
}

void addSupabaseHeaders(HTTPClient& http) {
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_ANON_KEY));
}

void fetchRemoteConfig() {
  HTTPClient http;
  http.begin(String(SUPABASE_URL) + "/rest/v1/rpc/get_device_config");
  addSupabaseHeaders(http);

  String payload = "{\"p_device_id\":\"" + String(DEVICE_ID) +
                    "\",\"p_device_secret\":\"" + String(DEVICE_SECRET) + "\"}";

  int httpCode = http.POST(payload);
  if (httpCode == 200) {
    String body = http.getString();
    float v;
    if (extractNumberField(body, "temp_min_c", &v)) TEMP_MIN_C = v;
    if (extractNumberField(body, "temp_max_c", &v)) TEMP_MAX_C = v;
    if (extractNumberField(body, "consecutive_breach_limit", &v)) CONSECUTIVE_BREACH_LIMIT = (int)v;
    if (extractNumberField(body, "sleep_interval_seconds", &v)) SLEEP_INTERVAL_SECONDS = (uint64_t)v;
    Serial.println("Remote config applied: min=" + String(TEMP_MIN_C) +
                    " max=" + String(TEMP_MAX_C) +
                    " breachLimit=" + String(CONSECUTIVE_BREACH_LIMIT) +
                    " sleepSec=" + String((unsigned long)SLEEP_INTERVAL_SECONDS));
  } else {
    Serial.println("get_device_config failed, HTTP code: " + String(httpCode) +
                    " -- keeping existing thresholds");
  }
  http.end();
}

// tiltDeg may be NAN (sensor failed, or the module was disturbed mid-read).
// The column is nullable, so post JSON null rather than skipping the whole
// reading -- the temperature is still worth recording.
bool postReading(float tempC, float tiltDeg, float batteryV) {
  HTTPClient http;
  http.begin(String(SUPABASE_URL) + "/rest/v1/rpc/ingest_reading");
  addSupabaseHeaders(http);

  String tiltField = isnan(tiltDeg) ? String("null") : String(tiltDeg, 2);

  String payload = "{\"p_device_id\":\"" + String(DEVICE_ID) +
                    "\",\"p_device_secret\":\"" + String(DEVICE_SECRET) +
                    "\",\"p_temperature_c\":" + String(tempC, 2) +
                    ",\"p_battery_v\":" + String(batteryV, 2) +
                    ",\"p_tilt_deg\":" + tiltField + "}";

  int httpCode = http.POST(payload);
  bool success = (httpCode == 200 || httpCode == 201 || httpCode == 204);

  if (!success) {
    Serial.println("Reading POST failed, HTTP code: " + String(httpCode));
    Serial.println(http.getString());
  } else {
    Serial.println("Reading posted OK");
  }

  http.end();
  return success;
}

bool postAlert(float tempC, const char* reason) {
  HTTPClient http;
  http.begin(String(SUPABASE_URL) + "/rest/v1/rpc/ingest_alert");
  addSupabaseHeaders(http);

  String payload = "{\"p_device_id\":\"" + String(DEVICE_ID) +
                    "\",\"p_device_secret\":\"" + String(DEVICE_SECRET) +
                    "\",\"p_temperature_c\":" + String(tempC, 2) +
                    ",\"p_reason\":\"" + String(reason) + "\"}";

  int httpCode = http.POST(payload);
  bool success = (httpCode == 200 || httpCode == 201 || httpCode == 204);

  Serial.println(success ? "Alert posted OK"
                         : "Alert POST failed, HTTP code: " + String(httpCode));

  http.end();
  return success;
}

// Temperature alerting is identical to the Hub's -- this module measures
// temperature too, so the same thresholds and the same latch apply.
// Gravity-based alerting ("fermentation stalled") needs trend history, which
// belongs in a backend job, not here.
void checkThresholdAndAlert(float tempC) {
  bool outOfRange = (tempC < TEMP_MIN_C || tempC > TEMP_MAX_C);

  if (outOfRange) {
    consecutiveBreaches++;
    Serial.println("Out of range reading (" + String(consecutiveBreaches) +
                    "/" + String(CONSECUTIVE_BREACH_LIMIT) + ")");

    if (consecutiveBreaches >= CONSECUTIVE_BREACH_LIMIT && !alertActive) {
      const char* reason = (tempC < TEMP_MIN_C) ? "below_min" : "above_max";
      if (postAlert(tempC, reason)) {
        alertActive = true;
      }
    }
  } else {
    if (consecutiveBreaches > 0 || alertActive) {
      Serial.println("Temperature back in range, resetting alert state");
    }
    consecutiveBreaches = 0;
    alertActive = false;
  }
}

void checkForOTAUpdate() {
  if (!OTA_ENABLED) return;
  if (cycleCount % OTA_CHECK_EVERY_N_CYCLES != 0) return;

  Serial.println("Checking for firmware update...");
  HTTPClient http;
  http.begin(OTA_MANIFEST_URL);
  int code = http.GET();
  if (code != 200) {
    Serial.println("OTA manifest fetch failed, HTTP code: " + String(code));
    http.end();
    return;
  }
  String body = http.getString();
  http.end();

  float versionF;
  if (!extractNumberField(body, "version", &versionF)) {
    Serial.println("OTA manifest missing version field");
    return;
  }
  if ((int)versionF <= FIRMWARE_VERSION) {
    Serial.println("Firmware up to date (v" + String(FIRMWARE_VERSION) + ")");
    return;
  }

  int urlStart = body.indexOf("\"url\":\"");
  if (urlStart == -1) {
    Serial.println("OTA manifest missing url field");
    return;
  }
  urlStart += 7;
  String firmwareUrl = body.substring(urlStart, body.indexOf("\"", urlStart));

  Serial.println("Newer firmware found, updating from " + firmwareUrl);
  WiFiClientSecure client;
  client.setInsecure(); // pinning the CA cert is a good follow-up hardening step
  t_httpUpdate_return ret = httpUpdate.update(client, firmwareUrl);

  if (ret == HTTP_UPDATE_FAILED) {
    Serial.println("OTA update failed: " + httpUpdate.getLastErrorString());
  } else if (ret == HTTP_UPDATE_NO_UPDATES) {
    Serial.println("OTA: no update applied");
  }
  // On success the device reboots on its own.
}

void setup() {
  Serial.begin(115200);
  delay(200);

  Serial.println("\n--- Temp + Gravity module waking up ---");
  cycleCount++;

  pinMode(BATTERY_EN_PIN, OUTPUT);
  digitalWrite(BATTERY_EN_PIN, LOW);

  sensors.begin();

  // Probe for the MCP9808 before reading. Wire.begin() is called inside both
  // mcp9808Begin() and adxlBegin(); calling it twice is harmless.
  mcp9808Present = mcp9808Begin();
  Serial.println(mcp9808Present ? "Temperature sensor: MCP9808 (I2C)"
                                : "Temperature sensor: DS18B20 (1-Wire fallback)");

  float tempC = readTemperature();

  float tiltDeg = NAN;
  if (adxlBegin()) {
    tiltDeg = readTiltDegrees();
    adxlSleep();
  }

  // Temperature is this module's primary reading; without it there's nothing
  // worth posting, so skip the cycle entirely (same failure policy as the Hub).
  if (isnan(tempC)) {
    Serial.println("Skipping cycle due to sensor read failure");
    goToSleep();
    return;
  }

  Serial.println("Temperature: " + String(tempC, 2) + " C");
  Serial.println("Tilt: " + (isnan(tiltDeg) ? String("unavailable") : String(tiltDeg, 2) + " deg"));

  float batteryV = readBatteryVoltage();

  if (connectWiFi()) {
    fetchRemoteConfig();
    postReading(tempC, tiltDeg, batteryV);
    checkThresholdAndAlert(tempC);
    checkForOTAUpdate();
    WiFi.disconnect(true);
  } else {
    // Keep counting breaches locally so a WiFi outage doesn't reset the
    // consecutive-breach state; the alert fires once connectivity returns.
    checkThresholdAndAlert(tempC);
    Serial.println("Skipped upload (no WiFi), will retry next cycle");
  }

  goToSleep();
}

void loop() {
  // Never reached - deep sleep restarts execution from setup().
}
