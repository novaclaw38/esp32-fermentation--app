"""Battery Voltage Sense — ungated divider, sized for ESP8266's 0-1.0V ADC.
Block from: architecture/block_diagram.md (block 3)
Interface nets: bat_plus, gnd, batt_sense_adc
Parts: R1 (330k), R2 (100k)

Ungated (no Q1/Q2), per hardware/PROTOTYPE_TEMP_GRAVITY.md's own guidance
for breadboard builds -- see architecture/design_risks.md. Ratio changed
from the production board's 1:1 100k/100k because ESP8266's A0 accepts
only 0-1.0V, not 0-3.3V: at 4.2V max cell, this divider gives ~0.98V.
"""
from skidl import *


@SubCircuit
def battery_sense(bat_plus, gnd, batt_sense_adc):
    r1 = Part("Device", "R", ref="R1", value="330k", footprint="Resistor_SMD:R_0603_1608Metric")
    r2 = Part("Device", "R", ref="R2", value="100k", footprint="Resistor_SMD:R_0603_1608Metric")

    bat_plus += r1[1]
    r1[2] += r2[1], batt_sense_adc
    gnd += r2[2]
