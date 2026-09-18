"""USB-C Power Input — charge-only receptacle with required CC pull-downs.
Block from: architecture/block_diagram.md (block 1)
Interface nets: vbus, gnd
Parts: J1 (USB-C power-only receptacle), R11, R12
"""
from skidl import *


@SubCircuit
def power_input(vbus, gnd):
    """USB-C power-only input. CC1/CC2 pull-downs are required for a
    USB-C charger to enable VBUS at all — see architecture/design_risks.md.
    """
    j1 = Part(
        "Connector", "USB_C_Receptacle_PowerOnly_6P", ref="J1",
        footprint="Connector_USB:USB_C_Receptacle_HRO_TYPE-C-31-M-12",
    )
    r_cc = Part("Device", "R", dest=TEMPLATE, footprint="Resistor_SMD:R_0603_1608Metric")
    r11 = r_cc(ref="R11", value="5.1k")
    r12 = r_cc(ref="R12", value="5.1k")

    vbus += j1["VBUS"]
    gnd += j1["GND"], j1["SHIELD"]
    j1["CC1"] += r11[1]
    j1["CC2"] += r12[1]
    gnd += r11[2], r12[2]
