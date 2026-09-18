"""Battery Voltage Sense — gated divider (Q1 PMOS + Q2 NPN low-side switch).
Block from: architecture/block_diagram.md (block 4)
Interface nets: bat_plus, gnd, div_en, batt_sense_adc
Parts: Q1 (AO3401A), Q2 (MMBT3904), R1, R2, R6, R10, C9
"""
from skidl import *


@SubCircuit
def battery_sense(bat_plus, gnd, div_en, batt_sense_adc):
    """Gated 100k/100k battery divider. Q2 (NPN) is a low-side switch for
    Q1's (PMOS) gate — a direct GPIO->gate connection can't guarantee a
    solid off state against a freshly-charged cell (see
    architecture/design_risks.md). Do not simplify this topology.
    """
    q1 = Part("Transistor_FET", "AO3401A", ref="Q1", footprint="Package_TO_SOT_SMD:SOT-23")
    q2 = Part("Transistor_BJT", "MMBT3904", ref="Q2", footprint="Package_TO_SOT_SMD:SOT-23")

    r_div = Part("Device", "R", dest=TEMPLATE, footprint="Resistor_SMD:R_0603_1608Metric")
    r1 = r_div(ref="R1", value="100k")
    r2 = r_div(ref="R2", value="100k")
    r6 = r_div(ref="R6", value="100k")
    r10 = r_div(ref="R10", value="10k")

    c9 = Part("Device", "C", ref="C9", value="0.1uF", footprint="Capacitor_SMD:C_0603_1608Metric")

    div_top = Net("DIV_TOP")

    # Q1: source at BAT+, drain feeds the divider, gate pulled to BAT+ by
    # R6 (off by default) and pulled low through Q2 when enabled.
    bat_plus += q1["S"], r6[1]
    q1["D"] += div_top
    r6[2] += q1["G"]
    q2["C"] += q1["G"]
    gnd += q2["E"]
    div_en += r10[1]
    r10[2] += q2["B"]

    div_top += r1[1]
    # Divider midpoint feeds the ADC directly; C9 is a parallel filter to
    # GND (not in series — a series cap would block the DC divider
    # voltage). R1||R2 source impedance + C9 forms the RC filter the
    # firmware's 30ms settling delay is sized for.
    r1[2] += r2[1], c9[1], batt_sense_adc
    gnd += r2[2], c9[2]
