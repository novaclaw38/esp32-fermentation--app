"""Battery Voltage Sense — ungated, single-stage divider.
Block from: architecture/block_diagram.md (block 3)
Interface nets: bat_plus, gnd, batt_sense_adc

Single stage, unlike the ESP8266 sibling rig: the ESP32's ADC accepts
0-3.3V natively (no onboard pre-divider quirk to work around). See
architecture/net_plan.md for the derivation -- same 100k/100k ratio
already sourced and verified for the production PCB's own divider.
"""
from skidl import *


@SubCircuit
def battery_sense(bat_plus, gnd, batt_sense_adc):
    r1 = Part("Device", "R", ref="R1", value="100k", footprint="Resistor_SMD:R_0603_1608Metric")
    r2 = Part("Device", "R", ref="R2", value="100k", footprint="Resistor_SMD:R_0603_1608Metric")

    bat_plus += r1[1]
    r1[2] += r2[1], batt_sense_adc
    gnd += r2[2]
