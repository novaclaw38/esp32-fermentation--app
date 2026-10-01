/*
  Fermentation Monitor - Temp + Gravity Module Firmware (v1, ESP32 Dev Kit V1 bench build)
  --------------------------------------------------------------------------------------
  Hardware: generic ESP32 Dev Kit V1 (WROOM-32, 30-pin breakout) + TP4056
  micro-USB charger breakout + GY-291 (ADXL345, I2C) + DHT11 (single-wire
  temp/humidity, GPIO4).
  See ../../esp32-devkit-tilt-prototype/ for the full SKiDL wiring
  diagram, BOM, and design-risk writeup this sketch was adapted alongside.

  This is NOT a from-scratch port like the ESP8266 sibling sketch needed --
  it's the production sketch (../fermentation_tilt_v1/fermentation_tilt_v1.ino)
  adapted, not rewritten. The production board already targets a bare ESP32
  (raw GPIO numbers, RTC_DATA_ATTR, Preferences/NVS, native 12-bit/0-3.3V
  ADC, single-argument HTTPClient::begin()) -- a Dev Kit V1 is the same
  ESP32-WROOM-32 chip with those same GPIOs broken out directly. Two
  differences from the production sketch:
    1. Battery-sense: this bench rig's divider is ungated (no Q1/Q2
       switching transistors), so BATTERY_EN_PIN drives nothing physical
       here -- it's still toggled for structural/behavioral parity with
       the production sketch, same convention the ESP8266 sibling uses.
    2. Temperature sensor: DHT11 instead of MCP9808/DS18B20. This is a
       genuinely different sensor family (not a wiring-only swap like
       MCP9808<->DS18B20 was on the sibling rigs, which share the same
       auto-detect logic) -- it needs its own library (Adafruit's "DHT
       sensor library" + its "Adafruit Unified Sensor" dependency) and
       its own read function, both below. DHT11 also reports humidity,
       posted alongside temperature via ingest_reading's p_humidity_pct
       (see supabase/migrations/20260923120000_dht11_humidity.sql) --
       null for every other device type on this project, which are all
       temperature-only sensors.

  ############################################################################
  # Hardware verification status: UNVERIFIED. No photo of the actual board #
  # used for this build has been checked yet -- see                        #
  # esp32-devkit-tilt-prototype/architecture/design_risks.md. In            #
  # particular: "ESP32 Dev Kit V1" is a cloned form factor whose PHYSICAL   #
  # pin layout varies between vendors even though the GPIO NUMBERS below    #
  # (4, 19, 23, 25, 34) are fixed by the WROOM-32 module itself. Locate     #
  # each pin by its printed GPIO label on your specific board, not by       #
  # counting header position from a generic diagram.                       #
  ############################################################################

  Behavior each wake cycle (unchanged from the production sketch):
    1. Wake from deep sleep
    2. Read DHT11 (temperature; humidity logged only) + average N
       accelerometer samples -> tilt angle
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
#include <DHT.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>

// ---------------------- CONFIG: EDIT BEFORE FLASHING ----------------------

// Compile-time WiFi is a FALLBACK, not the normal path -- same reasoning
// as the production sketch. Bench convenience only.
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

const char* DEVICE_ID     = "ferm-tilt-esp32-devkit-001";
const char* DEVICE_SECRET = "YOUR_PER_DEVICE_SECRET";

float TEMP_MIN_C = 18.0;
float TEMP_MAX_C = 24.0;
int CONSECUTIVE_BREACH_LIMIT = 3;

// Gravity moves slowly; 900s = 15 min default, server-configurable.
uint64_t SLEEP_INTERVAL_SECONDS = 900;

const unsigned long WIFI_TIMEOUT_MS = 15000;

// --- OTA ---
const bool OTA_ENABLED = false;
const char* OTA_MANIFEST_URL = "https://YOUR_PROJECT.supabase.co/storage/v1/object/public/firmware/tilt-esp32-devkit/manifest.json";
const int FIRMWARE_VERSION = 1;
const int OTA_CHECK_EVERY_N_CYCLES = 96;

// ---------------------------- PINS / HARDWARE ------------------------------
// See esp32-devkit-tilt-prototype/datasheets/ESP32_DEVKIT_V1_SUMMARY.md
// for the full pin reference and the pin-layout-varies-by-vendor caveat.

#define DHT_PIN         4   // DHT11 single-wire data (external 10k pull-up to 3V3 needed
                            // on the bare 4-pin sensor; the common 3-pin breakout already
                            // has one onboard -- see datasheets/DHT11_SUMMARY.md)
#define DHT_TYPE     DHT11
// SDA and SCL are off the production board's GPIO21/GPIO22: those pads are
// damaged on this bench board. The ESP32 routes I2C through its GPIO matrix,
// so any free bidirectional pin works. GPIO23 and GPIO19 are free, aren't
// strapping, flash or input-only pins, and sit on the same side of the Dev Kit
// V1 header, so the two wires route together. The production board keeps
// GPIO21 (SDA) and GPIO22 (SCL).
#define I2C_SDA        23
#define I2C_SCL        19
#define BATTERY_ADC_PIN 34  // ADC1_CH6, input-only
#define BATTERY_EN_PIN 25   // toggled for structural parity with the production sketch; drives
                            // nothing physical on this ungated build (see SPEC.md)

// ADXL345 on the GY-291 breakout (SDO tied to GND -> address 0x53)
const uint8_t ADXL345_ADDR        = 0x53;
const uint8_t ADXL345_REG_DEVID   = 0x00;
const uint8_t ADXL345_REG_POWER   = 0x2D;
const uint8_t ADXL345_REG_FORMAT  = 0x31;
const uint8_t ADXL345_REG_DATAX0  = 0x32;
const uint8_t ADXL345_DEVID_VALUE = 0xE5;

// Full-resolution mode is 3.9 mg per LSB regardless of range (256 LSB/g).
const float ADXL345_G_PER_LSB = 0.0039;

// The liquid sloshes and the module bobs; a single sample is noisy. Averaging
// a short burst costs a few ms and takes most of that out.
const int TILT_SAMPLE_COUNT = 24;
const int TILT_SAMPLE_DELAY_MS = 10;

// ---------------------------------------------------------------------------

DHT dht(DHT_PIN, DHT_TYPE);

RTC_DATA_ATTR int consecutiveBreaches = 0;
RTC_DATA_ATTR bool alertActive = false;
RTC_DATA_ATTR uint32_t cycleCount = 0;
RTC_DATA_ATTR int wifiFailures = 0;

// Latches a reported sensor fault so a broken sensor doesn't post an alert
// every single wake. Cleared by the first good read -- see reportSensorFault().
RTC_DATA_ATTR bool sensorFaultAlerted = false;

Preferences prefs;
String storedSsid, storedPass;

void goToSleep() {
  // Nothing to disable here (unlike the production board's gated
  // divider) -- this build's divider is permanently connected, per the
  // ungated-on-bench-rigs rationale in SPEC.md. Left LOW purely for
  // structural parity with the production/ESP8266 sketches.
  digitalWrite(BATTERY_EN_PIN, LOW);

  Serial.println("Entering deep sleep for " + String((unsigned long)SLEEP_INTERVAL_SECONDS) + "s");
  Serial.flush();
  esp_sleep_enable_timer_wakeup(SLEEP_INTERVAL_SECONDS * 1000000ULL);
  esp_deep_sleep_start();
}

bool connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(storedSsid.c_str(), storedPass.c_str());

  unsigned long start = millis();
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - start > WIFI_TIMEOUT_MS) {
      Serial.println("\nWiFi connect timed out");
      wifiFailures++;
      return false;
    }
    delay(250);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected: " + WiFi.localIP().toString());
  wifiFailures = 0;
  return true;
}

// --- DHT11 -----------------------------------------------------------------
// Reads both temperature and humidity in a single transaction (the sensor's
// protocol always returns both). Humidity is posted alongside temperature
// via ingest_reading's p_humidity_pct parameter (readings.humidity_pct
// column, added specifically for this sensor -- every other device type on
// this project is temperature-only, so it's null for them).
//
// DHT11 caveats worth knowing: +-2C accuracy, integer-only temperature
// resolution (no fractional degrees, unlike the MCP9808's 0.0625C steps),
// 0-50C range, and the library itself enforces a minimum ~1s gap between
// reads (irrelevant here -- this only reads once per wake cycle).
float lastHumidityPct = NAN;

float readTemperature() {
  float tempC = dht.readTemperature();
  lastHumidityPct = dht.readHumidity();

  if (isnan(tempC)) {
    Serial.println("Error: could not read DHT11 (check wiring on GPIO4 and, "
                    "if using the bare 4-pin sensor, its 10k pull-up to 3V3)");
    return NAN;
  }
  if (!isnan(lastHumidityPct)) {
    Serial.println("Humidity: " + String(lastHumidityPct, 1) + "%");
  }
  return tempC;
}

// Reads battery voltage through the ungated external 100k/100k divider.
// Ungated is deliberate on this bench build (see SPEC.md) -- there's no
// Q1/Q2 gate to enable/disable, so BATTERY_EN_PIN is toggled only for
// structural parity with the production sketch and drives nothing
// physical here.
float readBatteryVoltage() {
  digitalWrite(BATTERY_EN_PIN, HIGH);
  delay(30);

  int raw = analogRead(BATTERY_ADC_PIN);

  digitalWrite(BATTERY_EN_PIN, LOW);

  // x2 undoes the 1:1 divider. The ESP32's ADC is nonlinear near its rails,
  // so treat this as a low-battery warning, not a fuel gauge -- calibrate
  // the multiplier against a multimeter on the first unit.
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

// Back to standby (~0.1uA vs ~40uA measuring).
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

bool postReading(float tempC, float tiltDeg, float batteryV) {
  HTTPClient http;
  http.begin(String(SUPABASE_URL) + "/rest/v1/rpc/ingest_reading");
  addSupabaseHeaders(http);

  String tiltField = isnan(tiltDeg) ? String("null") : String(tiltDeg, 2);
  String humidityField = isnan(lastHumidityPct) ? String("null") : String(lastHumidityPct, 1);

  String payload = "{\"p_device_id\":\"" + String(DEVICE_ID) +
                    "\",\"p_device_secret\":\"" + String(DEVICE_SECRET) +
                    "\",\"p_temperature_c\":" + String(tempC, 2) +
                    ",\"p_battery_v\":" + String(batteryV, 2) +
                    ",\"p_tilt_deg\":" + tiltField +
                    ",\"p_humidity_pct\":" + humidityField + "}";

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

  bool shouldReport = !sensorFaultAlerted ||
                      (cycleCount % REANNOUNCE_EVERY_N_CYCLES == 0);
  if (!shouldReport) {
    Serial.println("Sensor still faulty (already reported)");
    return;
  }

  if (!connectWiFi()) {
    Serial.println("Sensor fault, but no WiFi to report it");
    return;
  }

  if (postAlert(NAN, "sensor_fault")) {
    sensorFaultAlerted = true;
    Serial.println("Reported sensor fault to the dashboard");
  }
  WiFi.disconnect(true);
}

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

// ---------------------------------------------------------------------------
// WiFi credential storage + setup portal
// ---------------------------------------------------------------------------

void loadCredentials() {
  prefs.begin("ferm", true);            // read-only
  storedSsid = prefs.getString("ssid", "");
  storedPass = prefs.getString("pass", "");
  prefs.end();

  if (storedSsid.length() == 0 && String(WIFI_SSID) != "YOUR_WIFI_SSID") {
    storedSsid = WIFI_SSID;
    storedPass = WIFI_PASSWORD;
    Serial.println("Using compile-time WiFi credentials (bench fallback)");
  }
}

void saveCredentials(const String& ssid, const String& pass) {
  prefs.begin("ferm", false);
  prefs.putString("ssid", ssid);
  prefs.putString("pass", pass);
  prefs.end();
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
  WebServer server(80);
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

  Serial.println("\n--- Temp + Gravity module (ESP32 Dev Kit V1 bench build) waking up ---");
  cycleCount++;

  pinMode(BATTERY_EN_PIN, OUTPUT);
  digitalWrite(BATTERY_EN_PIN, LOW);

  loadCredentials();

  bool noCreds  = storedSsid.length() == 0;
  bool onCharge = chargerConnected();
  bool stranded = wifiFailures >= WIFI_FAILURES_BEFORE_PORTAL;

  if (noCreds || onCharge || stranded) {
    Serial.println(noCreds  ? "No WiFi credentials stored -- starting setup portal"
                 : onCharge ? "Charger detected -- starting setup portal"
                            : "WiFi unreachable for many cycles -- starting setup portal");
    wifiFailures = 0;
    runSetupPortal();
    goToSleep();
    return;
  }

  dht.begin();
  Serial.println("Temperature sensor: DHT11 (GPIO4)");

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

  sensorFaultAlerted = false;

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
  // Never reached -- deep sleep restarts execution from setup().
}
