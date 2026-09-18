"""Li-ion Charge & Protection — TP4056 + DW01A + FS8205A + charge LEDs.
Block from: architecture/block_diagram.md (block 2)
Interface nets: vbus, bat_plus, gnd, v3v3
Parts: U2 (TP4056), U3 (DW01A), U4 (FS8205A), R9, D1, D2, R13, R14, J3

PROVISIONAL PINOUT NOTICE: U3 (DW01A) and U4 (FS8205A) have no symbol in
the standard KiCad library and their datasheet PDFs could not be
downloaded in this environment (see datasheets/DW01A_SUMMARY.md and
datasheets/FS8205A_SUMMARY.md). The functional topology below (DW01A
senses cell voltage and current via CS/VM and drives FS8205A's two
series gate-controlled FETs between BAT- and system GND) is the
standard, widely-used reference pairing for this exact chip combination.
The pin NUMBERS on both scratch-built parts are placeholders and MUST be
confirmed against the real manufacturer datasheets before this goes to
layout/fab — do not treat ERC passing here as pinout verification.
"""
from skidl import *


@SubCircuit
def charge_protection(vbus, bat_plus, gnd, v3v3):
    """TP4056 charge controller with DW01A+FS8205A protection stage."""
    u2 = Part(
        tool=SKIDL, name="TP4056", ref="U2", ref_prefix="U",
        footprint="Package_SO:SO-8_3.9x4.9mm_P1.27mm",
        pins=[
            Pin(num=1, name="TEMP", func=Pin.types.NOCONNECT),
            Pin(num=2, name="PROG", func=Pin.types.PASSIVE),
            Pin(num=3, name="GND", func=Pin.types.PWRIN),
            Pin(num=4, name="VCC", func=Pin.types.PWRIN),
            Pin(num=5, name="BAT", func=Pin.types.PWROUT),
            Pin(num=6, name="STDBY", func=Pin.types.OPENCOLL),
            Pin(num=7, name="CHRG", func=Pin.types.OPENCOLL),
            Pin(num=8, name="CE", func=Pin.types.INPUT),
        ],
    )

    # PROVISIONAL pin numbering — see module docstring.
    u3 = Part(
        tool=SKIDL, name="DW01A", ref="U3", ref_prefix="U",
        footprint="Package_TO_SOT_SMD:SOT-23-6",
        pins=[
            Pin(num=1, name="VM", func=Pin.types.INPUT),      # senses across the FET pair
            Pin(num=2, name="VDD", func=Pin.types.PWRIN),     # cell+
            Pin(num=3, name="VSS", func=Pin.types.PWRIN),     # cell- / GND reference
            Pin(num=4, name="CS", func=Pin.types.INPUT),      # shared FS8205A source node
            Pin(num=5, name="DO", func=Pin.types.OUTPUT),     # discharge-FET gate drive
            Pin(num=6, name="CO", func=Pin.types.OUTPUT),     # charge-FET gate drive
        ],
    )
    u4 = Part(
        tool=SKIDL, name="FS8205A", ref="U4", ref_prefix="U",
        footprint="Package_TO_SOT_SMD:SOT-23-6",
        pins=[
            Pin(num=1, name="G1", func=Pin.types.INPUT),      # charge-FET gate, from U3 CO
            Pin(num=2, name="S", func=Pin.types.PASSIVE),     # shared source, to U3 CS
            Pin(num=3, name="G2", func=Pin.types.INPUT),      # discharge-FET gate, from U3 DO
            Pin(num=4, name="D2", func=Pin.types.PASSIVE),    # discharge-FET drain, to system GND
            Pin(num=5, name="NC", func=Pin.types.NOCONNECT),
            Pin(num=6, name="D1", func=Pin.types.PASSIVE),    # charge-FET drain, to cell-
        ],
    )

    r_passive = Part("Device", "R", dest=TEMPLATE, footprint="Resistor_SMD:R_0603_1608Metric")
    r9 = r_passive(ref="R9", value="1.2k")
    r13 = r_passive(ref="R13", value="2k")
    r14 = r_passive(ref="R14", value="2k")

    c_bulk = Part("Device", "C", dest=TEMPLATE, footprint="Capacitor_SMD:C_0805_2012Metric")
    c5, c6 = c_bulk(2, value="10uF")
    c5.ref, c6.ref = "C5", "C6"

    d1 = Part("Device", "LED", ref="D1", value="red", footprint="LED_SMD:LED_0603_1608Metric")
    d2 = Part("Device", "LED", ref="D2", value="green", footprint="LED_SMD:LED_0603_1608Metric")

    j3 = Part(
        "Connector_Generic", "Conn_01x02", ref="J3",
        footprint="Connector_JST:JST_PH_B2B-PH-K_1x02_P2.00mm_Vertical",
    )

    cell_minus = Net("CELL_MINUS")

    # Power path: VBUS -> TP4056 -> DW01A/FS8205A -> cell (J3) / bat_plus
    vbus += u2["VCC"]
    c5[1] += vbus
    gnd += c5[2]
    gnd += u2["GND"], u2["CE"]
    u2["TEMP"] += NC

    u2["BAT"] += bat_plus
    c6[1] += bat_plus
    gnd += c6[2]

    # Protection stage between the cell and the TP4056/BAT+ node.
    bat_plus += u3["VDD"]
    u3["VSS"] += cell_minus
    gnd += cell_minus  # system GND == cell- through the closed protection FETs
    u3["CS"] += u4["S"]
    u3["VM"] += u4["S"]
    u3["DO"] += u4["G2"]
    u3["CO"] += u4["G1"]
    u4["D1"] += cell_minus
    u4["D2"] += gnd
    u4["NC"] += NC

    j3[1] += bat_plus
    j3[2] += cell_minus

    # PROG resistor sets charge current (~1A at 1.2k, 0.40C on a 2500mAh cell).
    u2["PROG"] += r9[1]
    gnd += r9[2]

    # Charge-status LEDs (open-drain outputs, active-low, pulled up to 3V3).
    v3v3 += r13[1], r14[1]
    r13[2] += d1["A"]
    d1["K"] += u2["CHRG"]
    r14[2] += d2["A"]
    d2["K"] += u2["STDBY"]
