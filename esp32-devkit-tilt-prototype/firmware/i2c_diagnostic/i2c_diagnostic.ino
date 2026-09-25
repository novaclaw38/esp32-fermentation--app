/*
  I2C diagnostic for the ESP32 Dev Kit V1 bench rig's GY-291 (ADXL345).

  Flash this instead of the main sketch, open the Serial Monitor at 115200,
  and read the report. It repeats every 5 seconds, so you can wiggle wires
  and watch the result change.

  For each candidate SDA/SCL pair it:
    1. Checks the idle bus levels. Both lines should read HIGH (pulled up).
       A line stuck LOW is a short to GND or a dead pin; a line that reads
       LOW with the internal pull-up on is not connected to anything that
       pulls it up.
    2. Scans every I2C address and lists what answers.
    3. If an ADXL345 answers (0x53 with SDO->GND, or 0x1D with SDO->3V3 or
       floating), reads its ID register (should be 0xE5) and one raw
       acceleration sample.

  The main sketch only looks at 0x53 on SDA 23 / SCL 22, so the report tells
  you which of those assumptions is wrong.
*/

#include <Wire.h>

struct PinPair { int sda; int scl; const char* note; };

// 23/22 is the wiring the main sketch expects. 22/23 catches swapped wires.
// 21/22 is the original pinout, in case SDA was never moved.
const PinPair PAIRS[] = {
  {23, 22, "expected wiring (SDA 23, SCL 22)"},
  {22, 23, "SDA/SCL swapped"},
  {21, 22, "original pins (SDA 21, SCL 22)"},
};

const uint8_t ADXL_ADDRS[] = {0x53, 0x1D};

void checkIdleLevels(int sda, int scl) {
  pinMode(sda, INPUT_PULLUP);
  pinMode(scl, INPUT_PULLUP);
  delay(5);
  int sdaLevel = digitalRead(sda);
  int sclLevel = digitalRead(scl);
  Serial.printf("  Idle levels: SDA(GPIO%d)=%s  SCL(GPIO%d)=%s\n",
                sda, sdaLevel ? "HIGH" : "LOW", scl, sclLevel ? "HIGH" : "LOW");
  if (!sdaLevel) Serial.println("  ! SDA is held LOW: shorted to GND, or the pin/pad is damaged.");
  if (!sclLevel) Serial.println("  ! SCL is held LOW: shorted to GND, or the pin/pad is damaged.");
}

bool readReg(uint8_t addr, uint8_t reg, uint8_t* out, uint8_t len) {
  Wire.beginTransmission(addr);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(addr, len) != len) return false;
  for (uint8_t i = 0; i < len; i++) out[i] = Wire.read();
  return true;
}

void probeAdxl(uint8_t addr) {
  uint8_t id = 0;
  if (!readReg(addr, 0x00, &id, 1)) {
    Serial.printf("  0x%02X answered the scan but the ID read failed.\n", addr);
    return;
  }
  Serial.printf("  0x%02X DEVID = 0x%02X %s\n", addr, id,
                id == 0xE5 ? "(ADXL345 confirmed)" : "(NOT an ADXL345 -- expected 0xE5)");
  if (id != 0xE5) return;

  if (addr == 0x1D) {
    Serial.println("  ! Found at 0x1D, but the main sketch uses 0x53.");
    Serial.println("    SDO is not reaching GND: wire GY-291 SDO -> GND.");
  }

  // Measure mode, full resolution, then one sample.
  Wire.beginTransmission(addr); Wire.write(0x31); Wire.write(0x08); Wire.endTransmission();
  Wire.beginTransmission(addr); Wire.write(0x2D); Wire.write(0x08); Wire.endTransmission();
  delay(20);
  uint8_t b[6];
  if (readReg(addr, 0x32, b, 6)) {
    int16_t x = (int16_t)((b[1] << 8) | b[0]);
    int16_t y = (int16_t)((b[3] << 8) | b[2]);
    int16_t z = (int16_t)((b[5] << 8) | b[4]);
    float g = 0.0039f;
    Serial.printf("  Accel: x=%.2fg y=%.2fg z=%.2fg (magnitude should be ~1.0g at rest)\n",
                  x * g, y * g, z * g);
  } else {
    Serial.println("  ! Acceleration read failed.");
  }
}

void scanPair(const PinPair& p) {
  Serial.printf("\n[%s]\n", p.note);
  checkIdleLevels(p.sda, p.scl);

  Wire.end();
  Wire.begin(p.sda, p.scl);
  Wire.setClock(100000);

  int found = 0;
  bool adxlFound = false;
  for (uint8_t addr = 0x08; addr < 0x78; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.printf("  Device answered at 0x%02X\n", addr);
      found++;
      for (uint8_t a : ADXL_ADDRS) {
        if (addr == a) { probeAdxl(addr); adxlFound = true; }
      }
    }
  }
  if (found == 0) Serial.println("  Nothing answered on this pin pair.");
  else if (!adxlFound) Serial.println("  Something answered, but not at 0x53 or 0x1D.");
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== GY-291 / ADXL345 I2C diagnostic ===");
}

void loop() {
  for (const PinPair& p : PAIRS) scanPair(p);
  Serial.println("\nIf nothing answers on any pair: check GY-291 VCC -> 3V3, GND -> GND,");
  Serial.println("and CS -> 3V3 (with CS low or floating the chip ignores I2C).");
  Serial.println("--- next scan in 5 s ---");
  delay(5000);
}
