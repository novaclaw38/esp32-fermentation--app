# Block Diagram — Temp + Gravity Module

7 functional blocks (> 3 ⇒ orchestrator should select **modular** coding
mode at the coding stage, one `skidl-block-coder` per block below).

```mermaid
flowchart TD
    subgraph PWR["1. USB-C Power Input"]
        J1[J1 USB-C receptacle\npower-only]
        CC1[R11 5.1k CC1->GND]
        CC2[R12 5.1k CC2->GND]
    end

    subgraph CHG["2. Li-ion Charge & Protection"]
        U2[U2 TP4056]
        U3[U3 DW01A]
        U4[U4 FS8205A]
        R9[R9 1.2k PROG]
        D1[D1 CHRG LED]
        D2[D2 STDBY LED]
    end

    subgraph REG["3. 3V3 Regulation"]
        U5[U5 XC6206 LDO\nlow-Iq]
        C7[C7 1uF in]
        C8[C8 1uF out]
    end

    subgraph SENSE["4. Battery Voltage Sense\ngated"]
        Q1[Q1 AO3401 PMOS]
        Q2[Q2 MMBT3904 NPN]
        R1[R1 100k]
        R2[R2 100k]
        R6[R6 100k gate pull-up to BAT+]
        R10[R10 10k Q2 base]
        C9[C9 0.1uF filter]
    end

    subgraph MCU["5. ESP32 MCU Core"]
        U1[U1 ESP32-WROOM-32E]
        R4[R4 EN pull-up]
        C1[C1 EN RC cap]
        R5[R5 IO0 pull-up]
        SW1[SW1 boot button]
        C2C3[C2,C3 VDD decouple]
        C4[C4 22uF bulk]
        J4[J4 6-pin prog header]
    end

    subgraph BUS["6. I2C Sensor Bus"]
        U6[U6 ADXL345 tilt]
        U7[U7 MCP9808 temp\nthermally bonded to housing]
        R7[R7 4.7k SDA pull-up]
        R8[R8 4.7k SCL pull-up]
        DS[optional DS18B20\nfallback, GPIO4 + R3]
    end

    subgraph CELL["Off-board"]
        BATT[18650 cell via J3]
    end

    J1 --> U2
    CC1 -.-> J1
    CC2 -.-> J1
    U2 --> U3 --> U4 --> BATT
    U2 -- BAT+/BAT- --> U5
    U5 -- 3V3 --> U1
    U5 -- 3V3 --> U6
    U5 -- 3V3 --> U7
    BATT -- BAT+ --> Q1
    Q1 --> R1 --> R2 --> C9 --> U1
    U1 -- GPIO25 enable --> R10 --> Q2 --> Q1
    U1 -- GPIO21/22 I2C --> U6
    U1 -- GPIO21/22 I2C --> U7
    U1 -.optional GPIO4.-> DS
    J4 --- U1
```

## Block list

| # | Block | Key parts | Interface nets |
|---|---|---|---|
| 1 | USB-C Power Input | J1, R11, R12 | VBUS, CC1, CC2, GND |
| 2 | Li-ion Charge & Protection | U2, U3, U4, R9, D1, D2, R13, R14 | VBUS, BAT+, BAT-, CHRG, STDBY |
| 3 | 3V3 Regulation | U5, C7, C8 | BAT+ (post-protection), 3V3 |
| 4 | Battery Voltage Sense (gated) | Q1, Q2, R1, R2, R6, R10, C9 | BAT+, 3V3, GPIO25, GPIO34 |
| 5 | ESP32 MCU Core | U1, R4, C1, R5, SW1, C2, C3, C4, J4 | 3V3, EN, IO0, TX, RX |
| 6 | I2C Sensor Bus | U6, U7, R7, R8, (optional DS18B20 + R3) | 3V3, GPIO21, GPIO22, (GPIO4) |
| 7 | Off-board cell | 18650 + J3 | BAT+, BAT- |
