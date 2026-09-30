/*
  Fermentation Monitor - v1 Firmware
  ------------------------------------
  Hardware: ESP32 DevKit + DS18B20 waterproof probe (GPIO4, 4.7k pull-up to 3V3)
            -- or a DHT11 on the same pin, see TEMP_SENSOR_DHT11 below
  Power: TP4056-charged 18650 Li-ion, deep sleep between readings
  Battery sense: 100k/100k divider from BAT+ into GPIO34 (ADC1_CH6)

  Behavior each wake cycle:
    1. Wake from deep sleep
    2. Connect to WiFi
    3. Read temperature from the DS18B20 (or DHT11)
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
#include <Update.h>
#include "mbedtls/sha256.h"

// ---------------------- CONFIG: EDIT BEFORE FLASHING ----------------------

// Temperature sensor. 0 = DS18B20 waterproof probe (the intended part).
// 1 = DHT11 on the same GPIO, for bench rigs built with one on hand.
// The DHT11 is an air sensor: it is not waterproof, reads only 0-50 C in
// whole degrees, and is +-2 C accurate -- fine for proving the pipeline,
// not for judging a ferment. See firmware/README.md.
#define TEMP_SENSOR_DHT11 0

#if TEMP_SENSOR_DHT11
  #include <DHT.h>
#else
  #include <OneWire.h>
  #include <DallasTemperature.h>
#endif

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

// GPIO pin the sensor's data line is connected to (DS18B20 or DHT11)
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

// --- TLS ---
// PEM of the root CA that signs SUPABASE_URL's certificate (the OTA download
// comes from the same host). With the placeholder left in, API calls stay
// encrypted but the server is NOT verified -- fine on a bench, not for a
// shipped unit -- and OTA refuses to run at all: an unverified connection
// would let anyone on the network hand this device arbitrary firmware.
// Get it with: openssl s_client -showcerts -connect YOUR_PROJECT.supabase.co:443
// and paste the LAST certificate in the chain (the root), newlines as \n.
const char* ROOT_CA_PEM = "PASTE_ROOT_CA_PEM";

// ---------------------------------------------------------------------------

#if TEMP_SENSOR_DHT11
DHT dht(ONE_WIRE_BUS, DHT11);
#else
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);
#endif

// Persisted across deep sleep using RTC memory
RTC_DATA_ATTR int consecutiveBreaches = 0;
RTC_DATA_ATTR bool alertActive = false;
RTC_DATA_ATTR uint32_t cycleCount = 0;
// Set once a sensor_fault alert has been accepted, so a dead probe reports
// once (plus a daily reminder) instead of every wake.
RTC_DATA_ATTR bool sensorFaultAlerted = false;

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

#if TEMP_SENSOR_DHT11
float readTemperature() {
  // The DHT11 needs ~1 s after power-up before it will answer, and a
  // DevKit's 3V3 rail may have only just come up on a cold boot. Waiting
  // here costs a second of awake time per cycle -- small next to WiFi.
  while (millis() < 1500) delay(50);

  // Single-wire timing on the DHT11 is fragile and the odd read fails its
  // checksum; one retry (after its 2 s minimum interval) clears most of them.
  float tempC = dht.readTemperature();
  if (isnan(tempC)) {
    delay(2100);
    tempC = dht.readTemperature(false, true);
  }
  if (isnan(tempC)) {
    Serial.println("Error: could not read DHT11 (check wiring/pull-up)");
    return NAN;
  }
  float humidity = dht.readHumidity();
  if (!isnan(humidity)) {
    // Logged only: ingest_reading now accepts p_humidity_pct, but this Hub sketch
    // does not send it yet (the ESP32 DevKit bench sketch does).
    Serial.println("Humidity: " + String(humidity, 0) + " %");
  }
  return tempC;
}
#else
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
#endif

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

// ------------------------------ TLS ----------------------------------------

bool rootCaConfigured() {
  return strncmp(ROOT_CA_PEM, "-----BEGIN", 10) == 0;
}

// One client for every HTTPS call this cycle. Verified against ROOT_CA_PEM
// when it's set; otherwise explicitly unverified, which is what a bare
// http.begin(url) silently did before -- now it's at least a visible choice.
WiFiClientSecure& tlsClient() {
  static WiFiClientSecure client;
  static bool configured = false;
  if (!configured) {
    if (rootCaConfigured()) {
      client.setCACert(ROOT_CA_PEM);
    } else {
      Serial.println("WARNING: ROOT_CA_PEM not set -- TLS server is not verified");
      client.setInsecure();
    }
    configured = true;
  }
  return client;
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

// Same idea for a string value: "key":"value". Values here are URLs and hex
// digests, which never contain an escaped quote.
String extractStringField(const String& json, const char* key) {
  String needle = "\"" + String(key) + "\":\"";
  int idx = json.indexOf(needle);
  if (idx == -1) return "";
  int start = idx + needle.length();
  int end = json.indexOf("\"", start);
  if (end == -1) return "";
  return json.substring(start, end);
}

// Fetches this device's current thresholds/sleep interval from Supabase via
// the get_device_config RPC (SECURITY DEFINER, verifies DEVICE_SECRET
// server-side). Silently keeps existing in-memory values on any failure so
// a backend hiccup never blocks a reading cycle.
void fetchRemoteConfig() {
  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/rpc/get_device_config";

  http.begin(tlsClient(), url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_ANON_KEY));

  String payload = "{\"p_device_id\":\"" + String(DEVICE_ID) +
                    "\",\"p_device_secret\":\"" + String(DEVICE_SECRET) + "\"}";

  int httpCode = http.POST(payload);
  if (httpCode == 200) {
    String body = http.getString();
    float v;
    // Every remote value is range-checked before use. A bad row (a cleared
    // form field saved as 0, say) must not be able to put the unit into a
    // wake loop that flattens the cell, or never wake it again. Out-of-range
    // values are ignored and the previous ones kept.
    float minC, maxC;
    if (extractNumberField(body, "temp_min_c", &minC) &&
        extractNumberField(body, "temp_max_c", &maxC) &&
        minC < maxC && minC >= -40 && maxC <= 125) {
      TEMP_MIN_C = minC;
      TEMP_MAX_C = maxC;
    }
    if (extractNumberField(body, "consecutive_breach_limit", &v) && v >= 1 && v <= 100) {
      CONSECUTIVE_BREACH_LIMIT = (int)v;
    }
    if (extractNumberField(body, "sleep_interval_seconds", &v) && v >= 60 && v <= 86400) {
      SLEEP_INTERVAL_SECONDS = (uint64_t)v;
    }
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

  http.begin(tlsClient(), url);
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

  http.begin(tlsClient(), url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_ANON_KEY));

  String payload = "{\"p_device_id\":\"" + String(DEVICE_ID) +
                    "\",\"p_device_secret\":\"" + String(DEVICE_SECRET) +
                    "\",\"p_temperature_c\":" +
                      // NAN would serialise as "nan", which isn't valid JSON;
                      // a sensor fault genuinely has no temperature.
                      (isnan(tempC) ? String("null") : String(tempC, 2)) +
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

// A failed probe used to skip the cycle before WiFi, which made a unit with a
// disconnected sensor indistinguishable from one that was flat or unplugged --
// the silent failure the product exists to prevent. Same approach as the
// Temp + Gravity sketch: come up, say so once, remind daily.
void reportSensorFault() {
  const uint32_t REANNOUNCE_EVERY_N_CYCLES = 144; // ~24h at a 10 min interval

  if (sensorFaultAlerted && cycleCount % REANNOUNCE_EVERY_N_CYCLES != 0) {
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

  // Fail closed: without a verified server, the manifest and the binary could
  // both come from whoever is between this device and the internet.
  if (!rootCaConfigured()) {
    Serial.println("OTA skipped: set ROOT_CA_PEM first -- refusing unverified firmware");
    return;
  }

  Serial.println("Checking for firmware update...");
  HTTPClient http;
  http.begin(tlsClient(), OTA_MANIFEST_URL);
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

  String firmwareUrl = extractStringField(body, "url");
  String expectedSha = extractStringField(body, "sha256");
  expectedSha.toLowerCase();
  if (firmwareUrl.length() == 0 || expectedSha.length() != 64) {
    Serial.println("OTA manifest missing url or sha256 -- refusing to update");
    return;
  }
  // The CA check proves who we're talking to only for hosts it covers; keep
  // the download on the same, verified project host.
  if (!firmwareUrl.startsWith(String(SUPABASE_URL) + "/")) {
    Serial.println("OTA url is not on SUPABASE_URL -- refusing to update");
    return;
  }

  Serial.println("Newer firmware v" + String(remoteVersion) + " found, downloading");
  http.begin(tlsClient(), firmwareUrl);
  code = http.GET();
  int size = http.getSize();
  if (code != 200 || size <= 0) {
    Serial.println("OTA download failed, HTTP code: " + String(code));
    http.end();
    return;
  }
  if (!Update.begin(size)) {
    Serial.println("OTA: not enough space for " + String(size) + " bytes");
    http.end();
    return;
  }

  // Hash while writing, and only commit the new image if it matches the
  // manifest. Update.end(true) is what makes the image bootable, so a
  // mismatch never gets that far.
  mbedtls_sha256_context sha;
  mbedtls_sha256_init(&sha);
  mbedtls_sha256_starts(&sha, 0);

  WiFiClient* stream = http.getStreamPtr();
  uint8_t buf[1024];
  int written = 0;
  unsigned long lastData = millis();
  while (written < size && millis() - lastData < 15000) {
    size_t avail = stream->available();
    if (avail == 0) {
      delay(5);
      continue;
    }
    int n = stream->readBytes(buf, min(avail, sizeof(buf)));
    if (n <= 0) continue;
    mbedtls_sha256_update(&sha, buf, n);
    if (Update.write(buf, n) != (size_t)n) break;
    written += n;
    lastData = millis();
  }
  http.end();

  uint8_t digest[32];
  mbedtls_sha256_finish(&sha, digest);
  mbedtls_sha256_free(&sha);
  char hex[65];
  for (int i = 0; i < 32; i++) sprintf(hex + i * 2, "%02x", digest[i]);
  hex[64] = 0;

  if (written != size || expectedSha != String(hex)) {
    Serial.println(written != size ? "OTA download incomplete -- discarded"
                                   : "OTA sha256 mismatch -- discarded");
    Update.abort();
    return;
  }
  if (!Update.end(true)) {
    Serial.println("OTA finalize failed: " + String(Update.errorString()));
    return;
  }
  Serial.println("OTA update v" + String(remoteVersion) + " verified and applied, rebooting");
  ESP.restart();
}

void setup() {
  Serial.begin(115200);
  delay(200); // let serial settle after wake

  Serial.println("\n--- Fermentation monitor waking up ---");
  cycleCount++;

#if TEMP_SENSOR_DHT11
  dht.begin();
#else
  sensors.begin();
#endif
  float tempC = readTemperature();

  if (isnan(tempC)) {
    Serial.println("Temperature read FAILED -- reporting instead of going silent");
    reportSensorFault();
    goToSleep();
    return;
  }

  // A good read clears the latch, so a reseated probe reports the next fault.
  sensorFaultAlerted = false;

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
