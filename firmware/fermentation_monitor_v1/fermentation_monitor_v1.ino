/*
  Fermentation Monitor - v1 Firmware
  ------------------------------------
  Hardware: ESP32 DevKit + DS18B20 waterproof probe (GPIO4, 4.7k pull-up to 3V3)
  Power: TP4056-charged 18650 Li-ion, deep sleep between readings
  Battery sense: 100k/100k divider from BAT+ into GPIO34 (ADC1_CH6)

  Behavior each wake cycle:
    1. Wake from deep sleep
    2. Connect to WiFi
    3. Read temperature from DS18B20
    4. Fetch this device's remote config (thresholds, sleep interval) via the
       ingest_reading/get_device_config RPCs, scoped by DEVICE_SECRET so one
       compromised device can't read/write another customer's data.
    5. POST reading to Supabase via the ingest_reading() RPC
    6. Check reading against thresholds; if out of range for
       CONSECUTIVE_BREACH_LIMIT consecutive readings, trigger an alert insert
       via the ingest_alert() RPC
    7. Once a day (see OTA_CHECK_EVERY_N_CYCLES), check for a newer firmware
       build and self-update over HTTPS
    8. Go back to deep sleep for the (possibly server-updated) sleep interval

  Notes:
    - Uses ESP32 RTC memory to persist consecutive-breach count and cycle
      counter across deep sleep cycles (deep sleep wipes normal RAM).
    - Designed to fail safe: if WiFi or a Supabase call fails, device still
      sleeps and retries next cycle rather than looping/draining battery.
    - Replace all CONFIG placeholders below before flashing.
    - Uses per-device RPC calls (not raw table inserts) so the anon key
      alone can't be used to write into another customer's device rows --
      see supabase/migrations for the ingest_reading/ingest_alert/
      get_device_config SECURITY DEFINER functions this firmware calls.
*/

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <HTTPUpdate.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// ---------------------- CONFIG: EDIT BEFORE FLASHING ----------------------

const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Supabase project REST endpoint + anon key. The anon key alone cannot read
// or write device rows -- every call also carries DEVICE_SECRET, checked
// server-side inside the RPC functions (see supabase/migrations).
const char* SUPABASE_URL      = "https://YOUR_PROJECT.supabase.co";
const char* SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

// Unique ID + secret for this physical device. Both are created in the
// `devices` table row for this unit (see dashboard "Add device" flow).
// Set differently per unit you build -- never reuse a secret across units.
const char* DEVICE_ID     = "ferm-monitor-001";
const char* DEVICE_SECRET = "YOUR_PER_DEVICE_SECRET";

// Starting alert thresholds (degrees C). These are only the fallback used
// on first boot before the device has ever fetched its config -- after
// that, the values stored in Supabase (editable from the dashboard) win.
float TEMP_MIN_C = 18.0;
float TEMP_MAX_C = 24.0;

// How many consecutive out-of-range readings before we fire an alert.
// Avoids false-alarm spam from a single noisy reading. Server-configurable.
int CONSECUTIVE_BREACH_LIMIT = 3;

// How long to sleep between readings (seconds). 600 = 10 minutes.
// Server-configurable via the devices table.
uint64_t SLEEP_INTERVAL_SECONDS = 600;

// GPIO pin the DS18B20 data line is connected to
#define ONE_WIRE_BUS 4

// Max time to wait for WiFi connection before giving up this cycle (ms)
const unsigned long WIFI_TIMEOUT_MS = 15000;

// --- OTA (optional but recommended before shipping a pre-sold batch) ---
// Publish releases from the dashboard's admin Firmware console
// (/admin/firmware -- see firmware/README.md) rather than editing Storage
// objects by hand; it writes this exact manifest.json/vN.bin pair for you.
// This is the Hub's own manifest -- the Temp + Gravity sketch reads a
// separate one at tilt/manifest.json, since the two sketches ship different
// binaries. Bump FIRMWARE_VERSION here to match the version you publish.
const bool OTA_ENABLED = false; // flip on once OTA_MANIFEST_URL is real
const char* OTA_MANIFEST_URL = "https://YOUR_PROJECT.supabase.co/storage/v1/object/public/firmware/hub/manifest.json";
const int FIRMWARE_VERSION = 1;
const int OTA_CHECK_EVERY_N_CYCLES = 144; // ~once/day at a 10 min interval

// ---------------------------------------------------------------------------

OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

// Persisted across deep sleep using RTC memory
RTC_DATA_ATTR int consecutiveBreaches = 0;
RTC_DATA_ATTR bool alertActive = false;
RTC_DATA_ATTR uint32_t cycleCount = 0;

void goToSleep() {
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

float readTemperature() {
  sensors.requestTemperatures();
  float tempC = sensors.getTempCByIndex(0);

  // DallasTemperature returns -127.0 on a read error / disconnected probe
  if (tempC == DEVICE_DISCONNECTED_C) {
    Serial.println("Error: could not read DS18B20 (check wiring/pull-up)");
    return NAN;
  }
  return tempC;
}

// Reads battery voltage via a 100k/100k resistor divider from BAT+ into
// GPIO34 (ADC1_CH6, input-only pin, safe to use during WiFi TX). This
// halves the ~3.0-4.2V battery range into the ESP32's safe ADC window.
float readBatteryVoltage() {
  const int BATTERY_ADC_PIN = 34;
  int raw = analogRead(BATTERY_ADC_PIN);
  // x2 to undo the 1:1 divider; ESP32 ADC is nonlinear near its rails, so
  // this is a good-enough estimate for a low-battery warning, not a
  // precision fuel gauge. Calibrate against a multimeter on your first unit.
  float voltage = (raw / 4095.0) * 3.3 * 2.0;
  return voltage;
}

// Simple string-field extractor for the small, known-shape JSON bodies
// Supabase RPCs return here. Avoids pulling in a full JSON library for a
// handful of numeric fields.
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

// Fetches this device's current thresholds/sleep interval from Supabase via
// the get_device_config RPC (SECURITY DEFINER, verifies DEVICE_SECRET
// server-side). Silently keeps existing in-memory values on any failure so
// a backend hiccup never blocks a reading cycle.
void fetchRemoteConfig() {
  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/rpc/get_device_config";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_ANON_KEY));

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

bool postReading(float tempC) {
  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/rpc/ingest_reading";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_ANON_KEY));

  String payload = "{\"p_device_id\":\"" + String(DEVICE_ID) +
                    "\",\"p_device_secret\":\"" + String(DEVICE_SECRET) +
                    "\",\"p_temperature_c\":" + String(tempC, 2) +
                    ",\"p_battery_v\":" + String(readBatteryVoltage(), 2) + "}";

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
  String url = String(SUPABASE_URL) + "/rest/v1/rpc/ingest_alert";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_ANON_KEY));

  String payload = "{\"p_device_id\":\"" + String(DEVICE_ID) +
                    "\",\"p_device_secret\":\"" + String(DEVICE_SECRET) +
                    "\",\"p_temperature_c\":" + String(tempC, 2) +
                    ",\"p_reason\":\"" + String(reason) + "\"}";

  int httpCode = http.POST(payload);
  bool success = (httpCode == 200 || httpCode == 201 || httpCode == 204);

  if (!success) {
    Serial.println("Alert POST failed, HTTP code: " + String(httpCode));
  } else {
    Serial.println("Alert posted OK");
  }

  http.end();
  return success;
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
        alertActive = true; // avoid re-alerting every cycle while still out of range
      }
    }
  } else {
    // Back in range: reset breach counter and clear alert state
    if (consecutiveBreaches > 0 || alertActive) {
      Serial.println("Temperature back in range, resetting alert state");
    }
    consecutiveBreaches = 0;
    alertActive = false;
  }
}

// Checks a small JSON manifest for a newer firmware build and, if found,
// downloads + flashes it over HTTPS. Runs at most once every
// OTA_CHECK_EVERY_N_CYCLES wakes to keep the battery cost low. On success
// the ESP32 reboots on its own; on any failure this just returns and the
// device continues its normal cycle.
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
  int remoteVersion = (int)versionF;
  if (remoteVersion <= FIRMWARE_VERSION) {
    Serial.println("Firmware up to date (v" + String(FIRMWARE_VERSION) + ")");
    return;
  }

  int urlStart = body.indexOf("\"url\":\"");
  if (urlStart == -1) {
    Serial.println("OTA manifest missing url field");
    return;
  }
  urlStart += 7;
  int urlEnd = body.indexOf("\"", urlStart);
  String firmwareUrl = body.substring(urlStart, urlEnd);

  Serial.println("Newer firmware v" + String(remoteVersion) + " found, updating from " + firmwareUrl);
  WiFiClientSecure client;
  client.setInsecure(); // pinning a CA cert is a good follow-up hardening step
  t_httpUpdate_return ret = httpUpdate.update(client, firmwareUrl);

  switch (ret) {
    case HTTP_UPDATE_FAILED:
      Serial.println("OTA update failed: " + httpUpdate.getLastErrorString());
      break;
    case HTTP_UPDATE_NO_UPDATES:
      Serial.println("OTA: no update applied");
      break;
    case HTTP_UPDATE_OK:
      Serial.println("OTA update applied, rebooting");
      break; // device reboots automatically on success
  }
}

void setup() {
  Serial.begin(115200);
  delay(200); // let serial settle after wake

  Serial.println("\n--- Fermentation monitor waking up ---");
  cycleCount++;

  sensors.begin();
  float tempC = readTemperature();

  if (isnan(tempC)) {
    // Sensor read failed - skip this cycle entirely, try again next wake
    Serial.println("Skipping cycle due to sensor read failure");
    goToSleep();
    return;
  }

  Serial.println("Temperature: " + String(tempC, 2) + " C");

  if (connectWiFi()) {
    fetchRemoteConfig();
    postReading(tempC);
    checkThresholdAndAlert(tempC);
    checkForOTAUpdate();
    WiFi.disconnect(true);
  } else {
    // No WiFi this cycle - still evaluate threshold locally so consecutive
    // breach counting doesn't stall during a WiFi outage, but we can't
    // alert or fetch config until connectivity returns.
    checkThresholdAndAlert(tempC);
    Serial.println("Skipped upload (no WiFi), will retry next cycle");
  }

  goToSleep();
}

void loop() {
  // Never reached - deep sleep restarts execution from setup()
}
