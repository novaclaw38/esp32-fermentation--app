"""ESP32 MCU Core — module, EN/IO0 boot circuitry, decoupling, programming header.
Block from: architecture/block_diagram.md (block 5)
Interface nets: v3v3, gnd, sda, scl, div_en, batt_sense_adc
Parts: U1 (ESP32-WROOM-32E), R4, C1, R5, SW1, C2, C3, C4, J4
"""
from skidl import *


@SubCircuit
def mcu_core(v3v3, gnd, sda, scl, div_en, batt_sense_adc):
    """ESP32 module + minimum application circuit + programming header.
    GPIO4/21/22/25/34 mapping is fixed by firmware/fermentation_tilt_v1/ —
    do not reassign without a firmware change.
    """
    u1 = Part(
        "RF_Module", "ESP32-WROOM-32E", ref="U1",
        footprint="RF_Module:ESP32-WROOM-32",  # no -32E-specific footprint in the standard lib; same castellated-edge mechanical outline as the base -32/-32D/-32U variants
    )

    r_pullup = Part("Device", "R", dest=TEMPLATE, footprint="Resistor_SMD:R_0603_1608Metric")
    r4 = r_pullup(ref="R4", value="10k")
    r5 = r_pullup(ref="R5", value="10k")

    c1 = Part("Device", "C", ref="C1", value="1uF", footprint="Capacitor_SMD:C_0603_1608Metric")
    c_decoup = Part("Device", "C", dest=TEMPLATE, footprint="Capacitor_SMD:C_0603_1608Metric")
    c2 = c_decoup(ref="C2", value="0.1uF")
    c3 = c_decoup(ref="C3", value="0.1uF")
    c4 = Part("Device", "C", ref="C4", value="22uF", footprint="Capacitor_SMD:C_0805_2012Metric")

    # XKB TS-1187A-B-A-B (LCSC C318884) — switched from the sourced BOM's
    # TS-1088-AR02016 (C720477) because a real KiCad footprint exists for
    # this part and not for the other; electrically equivalent SPST.
    sw1 = Part("Switch", "SW_Push", ref="SW1", value="TS-1187A-B-A-B", footprint="Button_Switch_SMD:SW_Push_1P1T_XKB_TS-1187A")

    j4 = Part(
        "Connector_Generic", "Conn_01x06", ref="J4",
        footprint="Connector_PinHeader_2.54mm:PinHeader_1x06_P2.54mm_Vertical",
    )

    # Power + decoupling
    v3v3 += u1["VDD"], c2[1], c3[1], c4[1], r4[1], r5[1]
    gnd += u1["GND"], c2[2], c3[2], c4[2]

    # EN: 10k pull-up + 1uF RC delay
    u1["EN"] += r4[2], c1[1]
    gnd += c1[2]

    # IO0: 10k pull-up + boot button
    u1["IO0"] += r5[2], sw1[1]
    gnd += sw1[2]

    # I2C bus (pull-ups live in sensor_bus.py, shared 3V3/GND already tied there)
    u1["IO21"] += sda
    u1["IO22"] += scl

    # Battery-sense divider enable + ADC input
    u1["IO25"] += div_en
    u1["IO34"] += batt_sense_adc

    # Unused GPIOs and sensor pins: mark no-connect (DS18B20 fallback on
    # GPIO4 is not populated in this build variant).
    u1["IO4", "IO2", "IO5", "IO12", "IO13", "IO14", "IO15", "IO16", "IO17",
       "IO18", "IO19", "IO23", "IO26", "IO27", "IO32", "IO33", "IO35",
       "SENSOR_VP", "SENSOR_VN"] += NC
    u1["NC"] += NC

    # Programming header: 3V3, GND, TXD0, RXD0, EN, IO0
    j4[1] += v3v3
    j4[2] += gnd
    j4[3] += u1["TXD0/IO1"]
    j4[4] += u1["RXD0/IO3"]
    j4[5] += u1["EN"]
    j4[6] += u1["IO0"]
