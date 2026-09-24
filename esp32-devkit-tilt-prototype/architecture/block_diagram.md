# Block Diagram — ESP32 Dev Kit V1 Bench Prototype

5 blocks, coded modularly for consistency with the ESP8266 sibling and
the production `circuits/temp_gravity_module/` package.

```mermaid
flowchart TD
    subgraph CHG["1. Charger Module (user-supplied)"]
        J1[Micro-USB 5V 1A input]
        TP[TP4056 + protection\n-- verify IC count before trusting]
    end

    subgraph CELL["Off-board"]
        BATT[18650 cell]
    end

    subgraph MCU["2. ESP32 Dev Kit V1"]
        U1[ESP32-WROOM-32 module\n30-pin breakout board]
    end

    subgraph SENSE["3. Battery Sense\nungated, single-stage (native 0-3.3V ADC)"]
        R1[100k]
        R2[100k]
    end

    subgraph BUS["4. Sensor Bus"]
        ACC[GY-291 / ADXL345\nI2C 0x53, SDO->GND, CS->3V3]
    end

    subgraph TEMP["5. Temperature\nsingle-wire, own GPIO"]
        DHT[DHT11 breakout\ntemp + humidity, GPIO4]
    end

    J1 --> TP
    TP -- B+/B- --> BATT
    TP -- OUT+/OUT- --> U1
    BATT -- BAT+ --> R1 --> R2 --> U1
    U1 -- GPIO23/22 I2C --> ACC
    U1 -- GPIO4 --> DHT
```

## Block list

| # | Block | Parts | Interface nets |
|---|---|---|---|
| 1 | Charger Module | TP4056 breakout (J-USB, B+/B-, OUT+/OUT-) | VBUS(5V), BAT_PLUS, BAT_MINUS |
| 2 | ESP32 Dev Kit V1 | ESP32-WROOM-32 module on a 30-pin breakout board | VIN, 3V3, GND, GPIO4, GPIO22, GPIO23, GPIO25, GPIO34 |
| 3 | Battery Sense (ungated) | R1 (100k), R2 (100k) | BAT_PLUS, GND, BATT_SENSE_ADC |
| 4 | Sensor Bus | GY-291 (ADXL345) | 3V3, GND, SDA, SCL |
| 5 | Temperature | DHT11 breakout | 3V3, GND, DHT_DATA |
