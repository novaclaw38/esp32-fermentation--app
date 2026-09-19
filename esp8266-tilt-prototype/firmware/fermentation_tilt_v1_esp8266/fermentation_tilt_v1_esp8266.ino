/*
  Fermentation Monitor - Temp + Gravity Module Firmware (v1, ESP8266 port)
  --------------------------------------------------------------------------
  Hardware: Wemos-pinout ESP8266 D1 Mini + GY-291 (ADXL345, I2C) +
  DS18B20 (bare TO-92 bench probe, D6) + TP4056 micro-USB charger breakout.
  See ../../esp8266-tilt-prototype/ for the full SKiDL wiring diagram,
  BOM, and design-risk writeup this sketch was ported alongside.

  This is a PORT of firmware/fermentation_tilt_v1/fermentation_tilt_v1.ino
  (the ESP32 production sketch), not a variant of it -- ESP8266 has none of
  RTC_DATA_ATTR, Preferences (NVS), a 12-bit/3.3V ADC, or the same GPIO
  numbering, so five subsystems were rewritten from scratch. Everything
  NOT called out below (Supabase RPC calls, threshold/alert logic, the
  captive-config portal's HTML/behavior, OTA manifest handling) is
  unchanged from the ESP32 sketch on purpose -- keep both in sync if you
  change shared behavior.

  ############################################################################
  # READ BEFORE FLASHING -- hardware checks this port cannot make for you   #
  ############################################################################
  1. D0 MUST be wired to RST (a jumper wire, or an existing on-board solder
     bridge -- check first). ESP8266 deep sleep wakes ONLY via GPIO16 (D0)
     pulsing RST low. Without this, the board sleeps once and never wakes --
     it will look exactly like a dead/bricked unit, not a firmware bug.
  2. Confirm the TP4056 breakout is a PROTECTED module (3 ICs: TP4056 +
     DW01A + FS8205, not just 1) before wiring a cell to it. Not needed for
     bench testing over USB only.
  3. Confirm A0 does NOT already have an onboard divider on this specific
     D1 Mini clone (multimeter, continuity check) before trusting the
     330k/100k external divider's math below -- see readBatteryVoltage().
  4. Confirm the GY-291's SDO pin is tied to GND (I2C address 0x53) --
     many clones float or pull it high, giving 0x1D instead.
  See esp8266-tilt-prototype/architecture/design_risks.md for the full list.
  ############################################################################

  Behavior each wake cycle (unchanged from the ESP32 sketch):
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
#include <ESP8266WiFi.h>
#include <WiFiClientSecure.h>        // same header/class name as ESP32's; ESP8266 core implements it via BearSSL
#include <ESP8266HTTPClient.h>
#include <ESP8266httpUpdate.h>       // note: global object is `ESPhttpUpdate`, not `httpUpdate`
#include <OneWire.h>
#include <DallasTemperature.h>
#include <ESP8266WebServer.h>        // ESP32's `WebServer` class is `ESP8266WebServer` here
#include <DNSServer.h>
#include <EEPROM.h>                  // replaces ESP32's `Preferences` (NVS) -- no NVS on ESP8266

// ---------------------- CONFIG: EDIT BEFORE FLASHING ----------------------

// Compile-time WiFi is a FALLBACK, not the normal path -- same reasoning
// as the ESP32 sketch. Bench convenience only.
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// --- Setup portal -----------------------------------------------------------
const unsigned long PORTAL_TIMEOUT_MS = 5UL * 60UL * 1000UL;

// -1 disables it (this bench rig has no charge-detect wiring). Wire to the
// TP4056 breakout's CHRG output if you want this.
const int CHARGE_DETECT_PIN = -1;

const int WIFI_FAILURES_BEFORE_PORTAL = 12;

const char* SUPABASE_URL      = "https://YOUR_PROJECT.supabase.co";
const char* SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

const char* DEVICE_ID     = "ferm-tilt-esp8266-001";
const char* DEVICE_SECRET = "YOUR_PER_DEVICE_SECRET";

float TEMP_MIN_C = 18.0;
float TEMP_MAX_C = 24.0;
int CONSECUTIVE_BREACH_LIMIT = 3;

// Gravity moves slowly; 900s = 15 min default, server-configurable.
// NOTE: ESP8266's ESP.deepSleep() argument is a 32-bit microsecond value,
// so the practical ceiling is ~4294 seconds (~71.5 min) before it wraps.
// Clamped in goToSleep() below rather than trusting the server blindly.
uint64_t SLEEP_INTERVAL_SECONDS = 900;
const uint32_t ESP8266_MAX_SLEEP_SECONDS = 4200; // ~70 min, safety margin under the wrap point

const unsigned long WIFI_TIMEOUT_MS = 15000;

// --- OTA ---
const bool OTA_ENABLED = false;
const char* OTA_MANIFEST_URL = "https://YOUR_PROJECT.supabase.co/storage/v1/object/public/firmware/tilt-esp8266/manifest.json";
const int FIRMWARE_VERSION = 1;
const int OTA_CHECK_EVERY_N_CYCLES = 96;

// ---------------------------- PINS / HARDWARE ------------------------------
// Wemos D1 Mini silkscreen -> GPIO. See
// esp8266-tilt-prototype/datasheets/D1_MINI_ESP8266_SUMMARY.md for the
// full pin reference and why D3/D4/D8 are avoided (boot-strapping pins).

#define ONE_WIRE_BUS    12  // D6 -- DS18B20 data (4.7k pull-up to 3V3 if the probe lacks one)
#define I2C_SDA          4  // D2
#define I2C_SCL          5  // D1
#define BATTERY_ADC_PIN A0  // ESP8266's only ADC pin -- 10-bit, 0-1.0V range (NOT ESP32's 0-3.3V)
#define BATTERY_EN_PIN  13  // D7 -- toggled for structural parity with the ESP32 sketch; drives
                            // nothing physical on this build (ungated divider, see SPEC.md)

// ADXL345 on the GY-291 breakout (SDO tied to GND -> address 0x53)
const uint8_t ADXL345_ADDR        = 0x53;
const uint8_t ADXL345_REG_DEVID   = 0x00;
const uint8_t ADXL345_REG_POWER   = 0x2D;
const uint8_t ADXL345_REG_FORMAT  = 0x31;
const uint8_t ADXL345_REG_DATAX0  = 0x32;
const uint8_t ADXL345_DEVID_VALUE = 0xE5;

// MCP9808 is a production-board-only part (shares the ADXL345's I2C bus
// on that board) -- this bench rig has no MCP9808, so mcp9808Present will
// always be false and the DS18B20 fallback path is what actually runs.
// Left in so this file stays a straightforward diff against the ESP32
// sketch rather than deleting a whole subsystem.
const uint8_t MCP9808_ADDR         = 0x18;
const uint8_t MCP9808_REG_CONFIG   = 0x01;
const uint8_t MCP9808_REG_AMBIENT  = 0x05;
const uint8_t MCP9808_REG_MANUF_ID = 0x06;
const uint16_t MCP9808_MANUF_ID    = 0x0054;
const uint8_t MCP9808_REG_RESOLUTION = 0x08;

const float ADXL345_G_PER_LSB = 0.0039;

const int TILT_SAMPLE_COUNT = 24;
const int TILT_SAMPLE_DELAY_MS = 10;

// Battery divider: 330k (top, BAT+) / 100k (bottom, GND), NOT the
// production board's 1:1 100k/100k -- ESP8266's A0 only accepts 0-1.0V.
// At a max cell voltage of 4.2V this divider gives ~0.98V, safely under
// the limit. Multiplier below undoes it: (330k+100k)/100k = 4.3.
const float BATTERY_DIVIDER_MULTIPLIER = 4.3;

// ---------------------------------------------------------------------------

OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

bool mcp9808Present = false;

// --- Deep-sleep-persistent state -------------------------------------------
// ESP8266 has no RTC_DATA_ATTR. State that must survive deep sleep is
// packed into one struct and manually written to/read from the chip's
// RTC user memory (a fixed 512-byte block). Unlike ESP32, this memory is
// NOT zeroed on a cold power-up -- it's whatever was left over, so a
// magic value + checksum is required to tell "real saved state" apart
// from garbage. This is the "manual RTC memory with a CRC" the project's
// own ESP8266-vs-ESP32 warning refers to (hardware/PROTOTYPE_TEMP_GRAVITY.md).
//
// All fields are uint32_t (even the logically-boolean ones) so the
// struct has no compiler-inserted padding -- rtcUserMemoryWrite/Read
// operate on raw 4-byte words and a misaligned struct would silently
// corrupt on some toolchains.
struct RtcData {
  uint32_t magic;
  uint32_t consecutiveBreaches;
  uint32_t alertActive;        // 0/1
  uint32_t cycleCount;
  uint32_t wifiFailures;
  uint32_t sensorFaultAlerted; // 0/1
  uint32_t checksum;           // must be last -- excluded from its own checksum
};

const uint32_t RTC_MAGIC = 0xFE1E5A11; // arbitrary sentinel distinguishing a real save from cold-boot garbage

uint32_t rtcChecksum(const RtcData& d) {
  // A simple XOR/rotate mix, not a real CRC32 -- this only needs to catch
  // "garbage from a cold boot," not defend against adversarial corruption,
  // and matches this codebase's existing preference for the simplest thing
  // that's good enough (see the hand-rolled JSON extractor below).
  uint32_t c = 0x5A5A5A5A;
  c ^= d.magic;
  c = (c << 3) | (c >> 29);
  c ^= d.consecutiveBreaches;
  c = (c << 3) | (c >> 29);
  c ^= d.alertActive;
  c = (c << 3) | (c >> 29);
  c ^= d.cycleCount;
  c = (c << 3) | (c >> 29);
  c ^= d.wifiFailures;
  c = (c << 3) | (c >> 29);
  c ^= d.sensorFaultAlerted;
  return c;
}

RtcData rtcData;

void loadRtcData() {
  ESP.rtcUserMemoryRead(0, (uint32_t*)&rtcData, sizeof(rtcData));
  if (rtcData.magic != RTC_MAGIC || rtcData.checksum != rtcChecksum(rtcData)) {
    Serial.println("RTC memory invalid or cold boot -- resetting persistent state");
    memset(&rtcData, 0, sizeof(rtcData));
    rtcData.magic = RTC_MAGIC;
    rtcData.checksum = rtcChecksum(rtcData);
  }
}

void saveRtcData() {
  rtcData.checksum = rtcChecksum(rtcData);
  ESP.rtcUserMemoryWrite(0, (uint32_t*)&rtcData, sizeof(rtcData));
}

// --- WiFi credential storage (EEPROM, replaces Preferences/NVS) -----------
// ESP8266's EEPROM library emulates byte-addressable storage in flash.
// Layout: [0] = valid-magic byte, [1..32] = SSID (null-padded),
// [33..96] = password (null-padded). 128 bytes reserved total.
#define EEPROM_SIZE 128
#define EEPROM_VALID_BYTE 0
#define EEPROM_VALID_MAGIC 0x42
#define EEPROM_SSID_OFFSET 1
#define EEPROM_SSID_LEN 32
#define EEPROM_PASS_OFFSET 33
#define EEPROM_PASS_LEN 64

String storedSsid, storedPass;

void goToSleep() {
  digitalWrite(BATTERY_EN_PIN, LOW);
  saveRtcData();

  uint32_t sleepSec = (uint32_t)SLEEP_INTERVAL_SECONDS;
  if (sleepSec > ESP8266_MAX_SLEEP_SECONDS) {
    Serial.println("Requested sleep interval exceeds ESP8266's ~70min deep-sleep "
                    "ceiling -- clamping to avoid a microsecond-counter wrap");
    sleepSec = ESP8266_MAX_SLEEP_SECONDS;
  }

  Serial.println("Entering deep sleep for " + String(sleepSec) + "s");
  Serial.flush();
  ESP.deepSleep((uint64_t)sleepSec * 1000000ULL, WAKE_RF_DEFAULT);
  // Execution does not continue past here -- deep sleep restarts at setup()
  // once D0 pulses RST low. If D0 isn't wired to RST, this call blocks
  // forever and the board never wakes (see the top-of-file warning).
}

bool connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(storedSsid.c_str(), storedPass.c_str());

  unsigned long start = millis();
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - start > WIFI_TIMEOUT_MS) {
      Serial.println("\nWiFi connect timed out");
      rtcData.wifiFailures++;
      return false;
    }
    delay(250);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected: " + WiFi.localIP().toString());
  rtcData.wifiFailures = 0;
  return true;
}

// --- MCP9808 (unused on this bench build -- see hardware note above) -----

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

bool mcp9808Begin() {
  Wire.begin(I2C_SDA, I2C_SCL);

  uint16_t manuf;
  if (!mcp9808Read16(MCP9808_REG_MANUF_ID, &manuf)) return false;
  if (manuf != MCP9808_MANUF_ID) {
    Serial.println("Device at 0x18 is not an MCP9808 (manuf 0x" + String(manuf, HEX) + ")");
    return false;
  }

  Wire.beginTransmission(MCP9808_ADDR);
  Wire.write(MCP9808_REG_RESOLUTION);
  Wire.write(0x03);
  Wire.endTransmission();

  mcp9808Write16(MCP9808_REG_CONFIG, 0x0000);
  return true;
}

void mcp9808Sleep() {
  mcp9808Write16(MCP9808_REG_CONFIG, 0x0100);
}

float mcp9808ReadC() {
  delay(260);

  uint16_t raw;
  if (!mcp9808Read16(MCP9808_REG_AMBIENT, &raw)) {
    Serial.println("Error: MCP9808 ambient read failed");
    return NAN;
  }

  float tempC = (raw & 0x0FFF) / 16.0;
  if (raw & 0x1000) tempC -= 256.0;
  return tempC;
}

// --- DS18B20 (the sensor actually fitted on this bench build) ------------

float ds18b20ReadC() {
  sensors.requestTemperatures();
  float tempC = sensors.getTempCByIndex(0);

  if (tempC == DEVICE_DISCONNECTED_C) {
    Serial.println("Error: could not read DS18B20 (check the sensor's solder joints "
                    "and the 4.7k pull-up on D6)");
    return NAN;
  }
  return tempC;
}

float readTemperature() {
  if (mcp9808Present) {
    float tempC = mcp9808ReadC();
    mcp9808Sleep();
    return tempC;
  }
  return ds18b20ReadC();
}

// Reads battery voltage through the ungated 330k/100k divider. Ungated is
// deliberate on this bench build (see SPEC.md) -- there's no Q1/Q2 gate to
// enable/disable, so BATTERY_EN_PIN is toggled only for structural parity
// with the production sketch and drives nothing physical here.
float readBatteryVoltage() {
  digitalWrite(BATTERY_EN_PIN, HIGH);
  delay(30);

  int raw = analogRead(BATTERY_ADC_PIN);

  digitalWrite(BATTERY_EN_PIN, LOW);

  // ESP8266 ADC: 10-bit (0-1023), 0-1.0V range. Multiplier undoes the
  // 330k/100k divider -- see the constant's definition above for the math.
  // Same caveat as the ESP32 sketch: treat as a low-battery warning, not a
  // fuel gauge, and calibrate against a multimeter on the first unit.
  return (raw / 1023.0) * 1.0 * BATTERY_DIVIDER_MULTIPLIER;
}

// --------------------------- ADXL345 (inline) ------------------------------

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
    Serial.println("ADXL345 DEVID mismatch: got 0x" + String(devid, HEX) +
                    " -- check GY-291 SDO is tied to GND (address 0x53)");
    return false;
  }

  adxlWrite(ADXL345_REG_FORMAT, 0x08);
  adxlWrite(ADXL345_REG_POWER, 0x08);
  delay(20);
  return true;
}

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

// AXIS ASSUMPTION unverified -- same calibration-step-1 caveat as the
// ESP32 sketch. Confirm on the bench before trusting any reading.
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
  if (magnitude < 0.80 || magnitude > 1.20) {
    Serial.println("Discarding tilt: |a| = " + String(magnitude, 3) +
                   "g, module likely disturbed");
    return NAN;
  }

  double tilt = atan2(sqrt(ay * ay + az * az), fabs(ax)) * 180.0 / PI;
  return (float)tilt;
}

// ------------------------------ Supabase -----------------------------------
// Unchanged from the ESP32 sketch -- HTTPClient/WiFiClientSecure have the
// same API surface on both cores.

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

// ESP8266's HTTPClient::begin(String url) single-argument overload is
// obsolete (compile error, not just a warning) -- unlike ESP32, it can't
// implicitly construct and own the underlying TCP client for an https://
// URL. Every call site needs its own WiFiClientSecure passed explicitly.
// setInsecure() matches the OTA path's existing choice below; pin the
// real CA cert before a field batch, same caveat as the ESP32 sketch.
WiFiClientSecure supabaseClient() {
  WiFiClientSecure client;
  client.setInsecure();
  return client;
}

void fetchRemoteConfig() {
  WiFiClientSecure client = supabaseClient();
  HTTPClient http;
  http.begin(client, String(SUPABASE_URL) + "/rest/v1/rpc/get_device_config");
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

bool postReading(float tempC, float tiltDeg, float batteryV) {
  WiFiClientSecure client = supabaseClient();
  HTTPClient http;
  http.begin(client, String(SUPABASE_URL) + "/rest/v1/rpc/ingest_reading");
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
  WiFiClientSecure client = supabaseClient();
  HTTPClient http;
  http.begin(client, String(SUPABASE_URL) + "/rest/v1/rpc/ingest_alert");
  addSupabaseHeaders(http);

  String payload = "{\"p_device_id\":\"" + String(DEVICE_ID) +
                    "\",\"p_device_secret\":\"" + String(DEVICE_SECRET) +
                    "\",\"p_temperature_c\":" +
                      (isnan(tempC) ? String("null") : String(tempC, 2)) +
                    ",\"p_reason\":\"" + String(reason) + "\"}";

  int httpCode = http.POST(payload);
  bool success = (httpCode == 200 || httpCode == 201 || httpCode == 204);

  Serial.println(success ? "Alert posted OK"
                         : "Alert POST failed, HTTP code: " + String(httpCode));

  http.end();
  return success;
}

void reportSensorFault() {
  const uint32_t REANNOUNCE_EVERY_N_CYCLES = 96;

  bool shouldReport = !rtcData.sensorFaultAlerted ||
                      (rtcData.cycleCount % REANNOUNCE_EVERY_N_CYCLES == 0);
  if (!shouldReport) {
    Serial.println("Sensor still faulty (already reported)");
    return;
  }

  if (!connectWiFi()) {
    Serial.println("Sensor fault, but no WiFi to report it");
    return;
  }

  if (postAlert(NAN, "sensor_fault")) {
    rtcData.sensorFaultAlerted = 1;
    Serial.println("Reported sensor fault to the dashboard");
  }
  WiFi.disconnect(true);
}

void checkThresholdAndAlert(float tempC) {
  bool outOfRange = (tempC < TEMP_MIN_C || tempC > TEMP_MAX_C);

  if (outOfRange) {
    rtcData.consecutiveBreaches++;
    Serial.println("Out of range reading (" + String(rtcData.consecutiveBreaches) +
                    "/" + String(CONSECUTIVE_BREACH_LIMIT) + ")");

    if ((int)rtcData.consecutiveBreaches >= CONSECUTIVE_BREACH_LIMIT && !rtcData.alertActive) {
      const char* reason = (tempC < TEMP_MIN_C) ? "below_min" : "above_max";
      if (postAlert(tempC, reason)) {
        rtcData.alertActive = 1;
      }
    }
  } else {
    if (rtcData.consecutiveBreaches > 0 || rtcData.alertActive) {
      Serial.println("Temperature back in range, resetting alert state");
    }
    rtcData.consecutiveBreaches = 0;
    rtcData.alertActive = 0;
  }
}

void checkForOTAUpdate() {
  if (!OTA_ENABLED) return;
  if (rtcData.cycleCount % OTA_CHECK_EVERY_N_CYCLES != 0) return;

  Serial.println("Checking for firmware update...");
  WiFiClientSecure manifestClient = supabaseClient();
  HTTPClient http;
  http.begin(manifestClient, OTA_MANIFEST_URL);
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
  // ESP8266's TLS+update stack is the most memory-constrained thing this
  // sketch does -- if this hangs or resets under memory pressure, try
  // client.setBufferSizes(512, 512) before the update() call.
  t_httpUpdate_return ret = ESPhttpUpdate.update(client, firmwareUrl);

  if (ret == HTTP_UPDATE_FAILED) {
    Serial.println("OTA update failed: " + ESPhttpUpdate.getLastErrorString());
  } else if (ret == HTTP_UPDATE_NO_UPDATES) {
    Serial.println("OTA: no update applied");
  }
}

// ---------------------------------------------------------------------------
// WiFi credential storage (EEPROM) + setup portal
// ---------------------------------------------------------------------------

void loadCredentials() {
  EEPROM.begin(EEPROM_SIZE);
  if (EEPROM.read(EEPROM_VALID_BYTE) == EEPROM_VALID_MAGIC) {
    char ssidBuf[EEPROM_SSID_LEN + 1] = {0};
    char passBuf[EEPROM_PASS_LEN + 1] = {0};
    for (int i = 0; i < EEPROM_SSID_LEN; i++) ssidBuf[i] = (char)EEPROM.read(EEPROM_SSID_OFFSET + i);
    for (int i = 0; i < EEPROM_PASS_LEN; i++) passBuf[i] = (char)EEPROM.read(EEPROM_PASS_OFFSET + i);
    storedSsid = String(ssidBuf);
    storedPass = String(passBuf);
  }
  EEPROM.end();

  if (storedSsid.length() == 0 && String(WIFI_SSID) != "YOUR_WIFI_SSID") {
    storedSsid = WIFI_SSID;
    storedPass = WIFI_PASSWORD;
    Serial.println("Using compile-time WiFi credentials (bench fallback)");
  }
}

void saveCredentials(const String& ssid, const String& pass) {
  EEPROM.begin(EEPROM_SIZE);
  EEPROM.write(EEPROM_VALID_BYTE, EEPROM_VALID_MAGIC);
  for (int i = 0; i < EEPROM_SSID_LEN; i++) {
    EEPROM.write(EEPROM_SSID_OFFSET + i, i < (int)ssid.length() ? ssid[i] : 0);
  }
  for (int i = 0; i < EEPROM_PASS_LEN; i++) {
    EEPROM.write(EEPROM_PASS_OFFSET + i, i < (int)pass.length() ? pass[i] : 0);
  }
  EEPROM.commit();
  EEPROM.end();
}

String portalApName() {
  uint8_t mac[6];
  WiFi.macAddress(mac);
  char buf[32];
  snprintf(buf, sizeof(buf), "FermentationMonitor-%02X%02X%02X", mac[3], mac[4], mac[5]);
  return String(buf);
}

String htmlEscape(const String& in) {
  String out;
  out.reserve(in.length() + 8);
  for (size_t i = 0; i < in.length(); i++) {
    char c = in[i];
    if      (c == '&')  out += "&amp;";
    else if (c == '<')  out += "&lt;";
    else if (c == '>')  out += "&gt;";
    else if (c == '"')  out += "&quot;";
    else if (c == '\'') out += "&#39;";
    else                out += c;
  }
  return out;
}

String portalPage(const String& networks, const String& note) {
  String h = "<!doctype html><meta charset=utf-8>"
             "<meta name=viewport content='width=device-width,initial-scale=1'>"
             "<title>Fermentation Monitor setup</title><style>"
             "body{font:16px/1.5 system-ui,sans-serif;margin:0;padding:24px 18px;"
             "background:#f6f8fa;color:#14171c}h1{font-size:20px;margin:0 0 4px}"
             "p{color:#5c6472;margin:.4em 0}label{display:block;margin-top:14px;font-size:14px}"
             "input,select{width:100%;box-sizing:border-box;padding:10px;margin-top:4px;"
             "border:1px solid #c3cbd6;border-radius:6px;font-size:16px}"
             "button{width:100%;margin-top:18px;padding:12px;border:0;border-radius:6px;"
             "background:#9a6212;color:#fff;font-size:16px;font-weight:600}"
             ".note{background:#f4e6cc;border:1px solid #d9b372;border-radius:6px;"
             "padding:10px 12px;font-size:14px;margin-top:16px}</style>";
  h += "<h1>Fermentation Monitor</h1><p>Connect this unit to your WiFi.</p>";
  if (note.length()) h += "<div class=note>" + note + "</div>";
  h += "<form method=POST action=/save>";
  h += "<label>Network<select name=ssid>" + networks + "</select></label>";
  h += "<label>Password<input name=pass type=password autocomplete=off></label>";
  h += "<button type=submit>Save and connect</button></form>";
  h += "<div class=note><b>Don't see your network?</b> This device can only use "
       "<b>2.4&nbsp;GHz</b> WiFi &mdash; it has no 5&nbsp;GHz radio, so 5&nbsp;GHz "
       "networks never appear here. Many routers publish both under the same name; "
       "if yours splits them, pick the 2.4&nbsp;GHz one.</div>";
  return h;
}

void runSetupPortal() {
  ESP8266WebServer server(80);
  DNSServer dns;

  WiFi.mode(WIFI_AP_STA);
  String ap = portalApName();
  WiFi.softAP(ap.c_str());
  IPAddress ip = WiFi.softAPIP();
  Serial.println("Setup portal started. Join WiFi \"" + ap + "\" then open http://" + ip.toString());

  dns.start(53, "*", ip);

  int n = WiFi.scanNetworks();
  String opts;
  for (int i = 0; i < n; i++) {
    String ssid = WiFi.SSID(i);
    if (ssid.length() == 0) continue;
    String esc = htmlEscape(ssid);
    opts += "<option value='" + esc + "'>" + esc + " (" + String(WiFi.RSSI(i)) + " dBm)</option>";
  }
  if (opts.length() == 0) opts = "<option value=''>No 2.4 GHz networks found</option>";
  Serial.println("Scan found " + String(n) + " network(s)");

  bool saved = false;
  server.on("/save", HTTP_POST, [&]() {
    String ssid = server.arg("ssid");
    String pass = server.arg("pass");
    if (ssid.length() == 0) {
      server.send(200, "text/html", portalPage(opts, "Pick a network first."));
      return;
    }
    saveCredentials(ssid, pass);
    saved = true;
    server.send(200, "text/html",
      "<!doctype html><meta charset=utf-8>"
      "<meta name=viewport content='width=device-width,initial-scale=1'>"
      "<body style=\"font:16px/1.5 system-ui,sans-serif;padding:24px\">"
      "<h1 style=font-size:20px>Saved</h1><p>Connecting to <b>" + htmlEscape(ssid) + "</b>. "
      "This page will stop working as the unit leaves its own network &mdash; that's expected. "
      "Readings should appear on your dashboard within one wake cycle.</p>");
  });

  server.on("/", HTTP_GET, [&]() { server.send(200, "text/html", portalPage(opts, "")); });
  server.onNotFound([&]() { server.send(200, "text/html", portalPage(opts, "")); });
  server.begin();

  unsigned long start = millis();
  while (millis() - start < PORTAL_TIMEOUT_MS) {
    dns.processNextRequest();
    server.handleClient();
    if (saved) {
      delay(1500);
      Serial.println("Credentials saved, restarting");
      server.stop();
      dns.stop();
      WiFi.softAPdisconnect(true);
      ESP.restart();
    }
    delay(5);
  }

  Serial.println("Portal timed out with nothing saved; sleeping");
  server.stop();
  dns.stop();
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_OFF);
}

bool chargerConnected() {
  if (CHARGE_DETECT_PIN < 0) return false;
  pinMode(CHARGE_DETECT_PIN, INPUT);
  return digitalRead(CHARGE_DETECT_PIN) == HIGH;
}

void setup() {
  Serial.begin(115200);
  delay(200);

  Serial.println("\n--- Temp + Gravity module (ESP8266 bench build) waking up ---");

  loadRtcData();
  rtcData.cycleCount++;

  pinMode(BATTERY_EN_PIN, OUTPUT);
  digitalWrite(BATTERY_EN_PIN, LOW);

  loadCredentials();

  bool noCreds  = storedSsid.length() == 0;
  bool onCharge = chargerConnected();
  bool stranded = rtcData.wifiFailures >= (uint32_t)WIFI_FAILURES_BEFORE_PORTAL;

  if (noCreds || onCharge || stranded) {
    Serial.println(noCreds  ? "No WiFi credentials stored -- starting setup portal"
                 : onCharge ? "Charger detected -- starting setup portal"
                            : "WiFi unreachable for many cycles -- starting setup portal");
    rtcData.wifiFailures = 0;
    runSetupPortal();
    goToSleep();
    return;
  }

  sensors.begin();

  // MCP9808 probe will always fail on this bench build (no such sensor
  // fitted) -- kept for structural parity with the ESP32 sketch, see the
  // hardware note near MCP9808_ADDR above.
  mcp9808Present = mcp9808Begin();
  Serial.println(mcp9808Present ? "Temperature sensor: MCP9808 (I2C)"
                                : "Temperature sensor: DS18B20 (1-Wire)");

  float tempC = readTemperature();

  float tiltDeg = NAN;
  if (adxlBegin()) {
    tiltDeg = readTiltDegrees();
    adxlSleep();
  }

  if (isnan(tempC)) {
    Serial.println("Temperature read FAILED -- no reading to post this cycle");
    reportSensorFault();
    goToSleep();
    return;
  }

  rtcData.sensorFaultAlerted = 0;

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
    checkThresholdAndAlert(tempC);
    Serial.println("Skipped upload (no WiFi), will retry next cycle");
  }

  goToSleep();
}

void loop() {
  // Never reached -- deep sleep restarts execution from setup(), PROVIDED
  // D0 is wired to RST. If you're stuck in loop() forever after a flash,
  // that jumper is the first thing to check.
}
