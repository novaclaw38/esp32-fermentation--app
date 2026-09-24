"""3V3 Regulation — XC6206 low-Iq LDO.
Block from: architecture/block_diagram.md (block 3)
Interface nets: bat_plus, v3v3, gnd
Parts: U5 (XC6206P332MR-G), C7, C8
"""
from skidl import *


@SubCircuit
def regulation(bat_plus, v3v3, gnd):
    """3.3V LDO. Iq = 1uA (datasheet) comfortably beats the SPEC's <5uA
    requirement — do not substitute an AMS1117-class part here.
    """
    u5 = Part(
        "Regulator_Linear", "XC6206PxxxMR", ref="U5", value="XC6206P332MR-G",
        footprint="Package_TO_SOT_SMD:SOT-23",
    )
    c_io = Part("Device", "C", dest=TEMPLATE, footprint="Capacitor_SMD:C_0603_1608Metric")
    c7 = c_io(ref="C7", value="1uF")
    c8 = c_io(ref="C8", value="1uF")

    bat_plus += u5["VI"], c7[1]
    gnd += c7[2]
    u5["VO"] += v3v3, c8[1]
    gnd += c8[2], u5["GND"]
