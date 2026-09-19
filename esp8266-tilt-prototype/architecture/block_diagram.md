# Block Diagram — ESP8266 D1 Mini Bench Prototype

4 blocks (≤3 would be monolithic per the orchestrator's rule; 4 blocks
still coded modularly for consistency with `circuits/temp_gravity_module/`
and because each block maps 1:1 to a physical module you wire
independently on the breadboard).

```mermaid
flowchart TD
    subgraph CHG["1. Charger Module (user-supplied)"]
        J1[Micro-USB 5V 1A input]
        TP[TP4056 + protection\n⚠ IC count unverified]
    end

    subgraph CELL["Off-board"]
        BATT[18650 cell]
    end

    subgraph MCU["2. D1 Mini (ESP8266)"]
        U1[ESP-12F module\nWemos D1 Mini pinout]
    end

    subgraph SENSE["3. Battery Sense\nungated, per prototype doc"]
        R1[330k]
        R2[100k]
    end

    subgraph BUS["4. Sensor Bus"]
        ACC[GY-291 / ADXL345\nI2C 0x53, SDO->GND]
        DS[DS18B20 probe\n1-Wire, D6]
    end

    J1 --> TP
    TP -- B+/B- --> BATT
    TP -- OUT+/OUT- --> U1
    BATT -- BAT+ --> R1 --> R2 --> U1
    U1 -- D1/D2 I2C --> ACC
    U1 -- D6 1-Wire --> DS
    U1 -.D0-RST jumper\nrequired for wake.-> U1
```

## Block list

| # | Block | Parts | Interface nets |
|---|---|---|---|
| 1 | Charger Module | TP4056 breakout (J-USB, B+/B-, OUT+/OUT-) | VBUS(5V), BAT_PLUS, BAT_MINUS |
| 2 | D1 Mini (ESP8266) | ESP-12F module on Wemos-pinout carrier | 5V, 3V3, GND, D0/RST, D1, D2, D6, A0 |
| 3 | Battery Sense (ungated) | R1 (330k), R2 (100k) | BAT_PLUS, GND, BATT_SENSE_ADC |
| 4 | Sensor Bus | GY-291 (ADXL345), DS18B20 probe, R3 (4.7k pull-up if needed) | 3V3, GND, SDA, SCL, ONE_WIRE |
