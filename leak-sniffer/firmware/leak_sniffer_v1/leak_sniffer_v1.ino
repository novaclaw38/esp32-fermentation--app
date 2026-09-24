/*
  Leak Sniffer - Tracer-Gas Water Leak Detector Firmware (v1)
  -----------------------------------------------------------
  Hardware: ESP32-S3-WROOM-1 + TGS2616-C01 hydrogen sensor read by an
  ADS1115, SHT40 for temperature/humidity, 5V boost for heater and pump.
  See leak-sniffer/README.md and circuits/leak_sniffer/.

  The pipe under test is filled with forming gas (5% H2 / 95% N2). Hydrogen
  escaping at the leak rises through soil or slab; the sample pump pulls air
  from the probe tip across the sensor, whose resistance drops as H2 rises.

  The sniffer streams readings over Bluetooth LE to the dashboard's Sniffer
  page (Web Bluetooth). It needs no WiFi, which matters on a job site. With
  no phone connected it still works on its own: the buzzer clicks faster as
  the signal rises, like a Geiger counter.

  Signal: response = R0 / Rs, where R0 is the clean-air baseline taken at
  "zero". 1.0 = clean air; higher = more hydrogen. That's a relative scale,
  which is what pinpointing needs: you're looking for the peak, not a
  number. ppm is only reported once calibrated against a 100ppm reference
  gas (CONTROL opcode 0x04); until then it's 0xFFFF.

  BLE protocol (shared with dashboard/src/lib/sniffer.ts - keep in sync):
    Service  7a1e0001-3c4b-4f0e-9a51-6c2d8e4b5f10
    READING  7a1e0002-...  notify, 10Hz, 20 bytes little-endian (fits the
    default 23-byte ATT MTU, so it never depends on MTU negotiation):
       0 u16 seq           2 f32 rs_ohm       6 f32 r0_ohm (NaN = not zeroed)
      10 u16 ppm (0xFFFF = uncalibrated)      12 i16 temp_c x100 (INT16_MIN = none)
      14 u16 rh x100 (0xFFFF = none)          16 u16 vbat_mv
      18 u8  state (0 warming, 1 ready, 2 fault)
      19 u8  flags (bit0 pump on, bit1 on USB power, bit2 mark pressed)
    CONTROL  7a1e0003-...  write:
      0x01            zero: baseline R0 = current Rs
      0x02 <u8>       pump duty 0-255
      0x03 <u8>       buzzer 0 off / 1 on
      0x04            calibrate: current Rs is Rs at 100ppm H2 (stored)

  Button (SW3): short press = mark point (flag bit2 for the web app),
  hold 1s = zero.

  Board: "ESP32S3 Dev Module", USB CDC On Boot: Enabled.
  Library: Adafruit ADS1X15. Core: esp32 3.x (built and checked on 3.3.12).
*/

#include <Wire.h>
#include <Preferences.h>
#include <Adafruit_ADS1X15.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <esp_mac.h>
#include <math.h>

// ------------------------------- Pins ---------------------------------------
// Fixed by circuits/leak_sniffer/mcu_core.py - change both together.
const int PIN_SDA        = 8;
const int PIN_SCL        = 9;
const int PIN_HEATER_EN  = 4;
const int PIN_PUMP_PWM   = 5;
const int PIN_BOOST_EN   = 6;
const int PIN_BUZZER     = 7;
const int PIN_LED        = 15;
const int PIN_BTN        = 1;
const int PIN_VBUS_DET   = 12;

// ----------------------------- Tuning ---------------------------------------
const float RL_OHMS = 9980.0f;           // R9 + R10 (circuits/leak_sniffer/h2_sensor.py)

// MOS sensors need their heater to settle before the baseline means anything.
// Ready once past the minimum AND Rs has stopped drifting; forced at the max.
const uint32_t WARMUP_MIN_MS = 60UL * 1000UL;
const uint32_t WARMUP_MAX_MS = 300UL * 1000UL;
const float    WARMUP_STABLE_FRACTION = 0.005f;   // < 0.5% change per 10s

// Typical TGS2616-C01 slope: Rs(1000ppm)/Rs(100ppm) = 0.25-0.60 (datasheet).
// 0.4 is mid-range; only used for the optional ppm estimate.
const float PPM_DECADE_RATIO = 0.4f;

const uint8_t  DEFAULT_PUMP_DUTY = 180;
const uint32_t IDLE_OFF_MS = 30UL * 60UL * 1000UL;  // no phone, no button -> sleep
const uint32_t SAMPLE_PERIOD_MS = 20;               // 50Hz ADC sampling
const uint32_t NOTIFY_PERIOD_MS = 100;              // 10Hz to the web app
const float    EMA_ALPHA = 0.2f;

#define SERVICE_UUID  "7a1e0001-3c4b-4f0e-9a51-6c2d8e4b5f10"
#define READING_UUID  "7a1e0002-3c4b-4f0e-9a51-6c2d8e4b5f10"
#define CONTROL_UUID  "7a1e0003-3c4b-4f0e-9a51-6c2d8e4b5f10"

enum SensorState : uint8_t { WARMING = 0, READY = 1, FAULT = 2 };

// ------------------------------ State ---------------------------------------
Adafruit_ADS1115 ads;
Preferences prefs;
BLECharacteristic* readingChar = nullptr;

volatile bool bleConnected = false;
volatile int  pendingOpcode = -1;
volatile uint8_t pendingArg = 0;

SensorState state = WARMING;
float rsEma = NAN;
float r0 = NAN;
float rs100 = NAN;             // calibration: Rs at 100ppm H2, NAN if unset
float tempC = NAN, rh = NAN;
uint16_t vbatMv = 0;
uint8_t pumpDuty = DEFAULT_PUMP_DUTY;
bool buzzerOn = true;
bool markPending = false;

uint32_t heaterOnAt = 0;
uint32_t lastActivity = 0;
float warmupRefRs = NAN;
uint32_t warmupRefAt = 0;

// ------------------------------ BLE -----------------------------------------
class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer*) override { bleConnected = true; }
  void onDisconnect(BLEServer* server) override {
    bleConnected = false;
    server->getAdvertising()->start();   // stay discoverable
  }
};

class ControlCallbacks : public BLECharacteristicCallbacks {
  // Runs on the BLE task: just hand the command to loop().
  void onWrite(BLECharacteristic* c) override {
    String v = c->getValue();
    if (v.length() < 1) return;
    pendingArg = v.length() > 1 ? (uint8_t)v[1] : 0;
    pendingOpcode = (uint8_t)v[0];
  }
};

void setupBle() {
  uint8_t mac[6];
  esp_read_mac(mac, ESP_MAC_BT);
  char name[24];
  snprintf(name, sizeof(name), "LeakSniffer-%02X%02X", mac[4], mac[5]);

  BLEDevice::init(name);
  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());
  BLEService* service = server->createService(SERVICE_UUID);

  readingChar = service->createCharacteristic(
      READING_UUID, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);

  BLECharacteristic* control = service->createCharacteristic(
      CONTROL_UUID, BLECharacteristic::PROPERTY_WRITE);
  control->setCallbacks(new ControlCallbacks());

  service->start();
  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(SERVICE_UUID);
  adv->setScanResponse(true);
  BLEDevice::startAdvertising();
  Serial.printf("BLE advertising as %s\n", name);
}

// ---------------------------- Sensors ---------------------------------------
// Rs = RL x (VC / VRL - 1). AIN0 = VRL/2 and AIN1 = VC/2, so the /2 cancels
// and boost-rail drift cancels with it.
float readRs() {
  int16_t rawSense = ads.readADC_SingleEnded(0);
  int16_t rawV5 = ads.readADC_SingleEnded(1);
  if (rawSense <= 0 || rawV5 <= rawSense) return NAN;
  return RL_OHMS * ((float)rawV5 / (float)rawSense - 1.0f);
}

uint16_t readVbatMv() {
  return (uint16_t)(ads.computeVolts(ads.readADC_SingleEnded(2)) * 2000.0f);
}

bool readSht40() {
  Wire.beginTransmission(0x44);
  Wire.write(0xFD);                     // measure T+RH, high repeatability
  if (Wire.endTransmission() != 0) return false;
  delay(9);
  if (Wire.requestFrom(0x44, 6) != 6) return false;
  uint8_t b[6];
  for (int i = 0; i < 6; i++) b[i] = Wire.read();
  uint16_t t = (b[0] << 8) | b[1];
  uint16_t h = (b[3] << 8) | b[4];
  tempC = -45.0f + 175.0f * t / 65535.0f;
  rh = constrain(-6.0f + 125.0f * h / 65535.0f, 0.0f, 100.0f);
  return true;
}

float ppmFromRs(float rs) {
  if (isnan(rs100) || isnan(rs) || rs <= 0) return NAN;
  // Rs = Rs100 x (c/100)^alpha, alpha = log10(decade ratio)
  float alpha = log10f(PPM_DECADE_RATIO);
  return 100.0f * powf(rs / rs100, 1.0f / alpha);
}

// ---------------------------- Outputs ---------------------------------------
void setPump(uint8_t duty) {
  pumpDuty = duty;
  ledcWrite(PIN_PUMP_PWM, duty);
}

void beep(int freq, int ms) {
  ledcWriteTone(PIN_BUZZER, freq);
  delay(ms);
  ledcWriteTone(PIN_BUZZER, 0);
}

void powerDown() {
  Serial.println("Idle timeout: sleeping. Press the button to wake.");
  setPump(0);
  digitalWrite(PIN_HEATER_EN, LOW);
  digitalWrite(PIN_BOOST_EN, LOW);
  digitalWrite(PIN_LED, LOW);
  esp_sleep_enable_ext0_wakeup((gpio_num_t)PIN_BTN, 0);
  esp_deep_sleep_start();
}

void zeroBaseline() {
  if (isnan(rsEma)) return;
  r0 = rsEma;
  Serial.printf("Zeroed: R0 = %.0f ohm\n", r0);
  beep(1200, 60);
}

void handleCommand(int op, uint8_t arg) {
  switch (op) {
    case 0x01: zeroBaseline(); break;
    case 0x02: setPump(arg); break;
    case 0x03: buzzerOn = arg != 0; break;
    case 0x04:
      if (!isnan(rsEma)) {
        rs100 = rsEma;
        prefs.putFloat("rs100", rs100);
        Serial.printf("Calibrated: Rs(100ppm) = %.0f ohm\n", rs100);
      }
      break;
  }
}

// Geiger-style clicks: click rate rises with response above baseline.
void updateBuzzer(float response, uint32_t now) {
  static uint32_t lastClick = 0;
  if (!buzzerOn || state != READY || isnan(response) || response < 1.05f) return;
  float strength = constrain((response - 1.0f) / 3.0f, 0.0f, 1.0f);
  uint32_t interval = 600 - (uint32_t)(strength * 560.0f);   // 600ms -> 40ms
  if (now - lastClick >= interval) {
    lastClick = now;
    ledcWriteTone(PIN_BUZZER, 1800 + (int)(strength * 1200.0f));
    delay(4);
    ledcWriteTone(PIN_BUZZER, 0);
  }
}

void updateWarmup(uint32_t now) {
  if (state != WARMING || isnan(rsEma)) return;
  uint32_t elapsed = now - heaterOnAt;
  if (isnan(warmupRefRs) || now - warmupRefAt >= 10000) {
    bool stable = !isnan(warmupRefRs) &&
                  fabsf(rsEma - warmupRefRs) / warmupRefRs < WARMUP_STABLE_FRACTION;
    warmupRefRs = rsEma;
    warmupRefAt = now;
    if ((elapsed >= WARMUP_MIN_MS && stable) || elapsed >= WARMUP_MAX_MS) {
      state = READY;
      zeroBaseline();   // assumes it's warming up in clean air - re-zero if not
      Serial.println("Sensor ready.");
    }
  }
}

void handleButton(uint32_t now) {
  static bool wasDown = false;
  static uint32_t downAt = 0;
  static bool longFired = false;
  bool down = digitalRead(PIN_BTN) == LOW;
  if (down && !wasDown) { downAt = now; longFired = false; lastActivity = now; }
  if (down && !longFired && now - downAt >= 1000) { longFired = true; zeroBaseline(); }
  if (!down && wasDown && !longFired && now - downAt >= 30) { markPending = true; beep(2400, 30); }
  wasDown = down;
}

void notifyReading() {
  static uint16_t seq = 0;
  uint8_t buf[20];
  float ppmF = ppmFromRs(rsEma);
  uint16_t ppm = isnan(ppmF) ? 0xFFFF : (uint16_t)constrain(lroundf(ppmF), 0L, 65534L);
  int16_t t = isnan(tempC) ? INT16_MIN : (int16_t)lroundf(tempC * 100.0f);
  uint16_t h = isnan(rh) ? 0xFFFF : (uint16_t)lroundf(rh * 100.0f);
  uint8_t flags = (pumpDuty > 0 ? 0x01 : 0) |
                  (digitalRead(PIN_VBUS_DET) ? 0x02 : 0) |
                  (markPending ? 0x04 : 0);
  seq++;
  memcpy(buf + 0, &seq, 2);
  memcpy(buf + 2, &rsEma, 4);
  memcpy(buf + 6, &r0, 4);
  memcpy(buf + 10, &ppm, 2);
  memcpy(buf + 12, &t, 2);
  memcpy(buf + 14, &h, 2);
  memcpy(buf + 16, &vbatMv, 2);
  buf[18] = state;
  buf[19] = flags;
  readingChar->setValue(buf, sizeof(buf));
  if (bleConnected) readingChar->notify();
  markPending = false;   // a mark only means something to a connected app
}

// ----------------------------- Main -----------------------------------------
void setup() {
  Serial.begin(115200);
  pinMode(PIN_HEATER_EN, OUTPUT);
  pinMode(PIN_BOOST_EN, OUTPUT);
  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_BTN, INPUT);        // external 10k pull-up (R25)
  pinMode(PIN_VBUS_DET, INPUT);

  // Boost first, then heater: the heater is 5V-rated and V5 sits at
  // VBAT - 0.4V until the MT3608 starts.
  digitalWrite(PIN_BOOST_EN, HIGH);
  delay(5);
  digitalWrite(PIN_HEATER_EN, HIGH);
  heaterOnAt = millis();
  lastActivity = heaterOnAt;

  ledcAttach(PIN_PUMP_PWM, 20000, 8);
  ledcAttach(PIN_BUZZER, 2000, 8);
  setPump(DEFAULT_PUMP_DUTY);

  Wire.begin(PIN_SDA, PIN_SCL);
  if (!ads.begin(0x48, &Wire)) {
    Serial.println("ADS1115 not found - sensor fault.");
    state = FAULT;
  } else {
    ads.setGain(GAIN_ONE);                // +/-4.096V; inputs never exceed 2.6V
    ads.setDataRate(RATE_ADS1115_475SPS);
  }

  prefs.begin("sniffer", false);
  rs100 = prefs.getFloat("rs100", NAN);

  setupBle();
  beep(1800, 80);
}

void loop() {
  static uint32_t lastSample = 0, lastNotify = 0, lastSlow = 0;
  uint32_t now = millis();

  if (pendingOpcode >= 0) {
    int op = pendingOpcode;
    pendingOpcode = -1;
    handleCommand(op, pendingArg);
    lastActivity = now;
  }
  handleButton(now);
  if (bleConnected) lastActivity = now;

  if (state != FAULT && now - lastSample >= SAMPLE_PERIOD_MS) {
    lastSample = now;
    float rs = readRs();
    if (!isnan(rs)) rsEma = isnan(rsEma) ? rs : rsEma + EMA_ALPHA * (rs - rsEma);
    updateWarmup(now);
  }

  if (now - lastSlow >= 2000) {
    lastSlow = now;
    readSht40();
    if (state != FAULT) vbatMv = readVbatMv();
  }

  float response = (isnan(r0) || isnan(rsEma) || rsEma <= 0) ? NAN : r0 / rsEma;
  updateBuzzer(response, now);

  if (now - lastNotify >= NOTIFY_PERIOD_MS) {
    lastNotify = now;
    notifyReading();
    // LED: slow blink warming, solid ready, fast blink fault.
    uint32_t period = state == WARMING ? 1000 : state == FAULT ? 200 : 0;
    digitalWrite(PIN_LED, period == 0 ? HIGH : ((now / (period / 2)) & 1));
  }

  if (!bleConnected && now - lastActivity >= IDLE_OFF_MS) powerDown();
}
