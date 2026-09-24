"""USB-C Input — charge + native-USB data, with ESD protection.
Interface nets: vbus, gnd, usb_dp, usb_dn
Parts: J1 (USB-C 16P), U7 (USBLC6-2SC6), R1, R2, C1
"""
from skidl import *


@SubCircuit
def usb_power(vbus, gnd, usb_dp, usb_dn):
    """USB 2.0 receptacle. 5.1k CC pull-downs make a Type-C charger enable
    VBUS; D+/D- go to the ESP32-S3's native USB for flashing and serial.
    """
    j1 = Part(
        "Connector", "USB_C_Receptacle_USB2.0_16P", ref="J1",
        footprint="Connector_USB:USB_C_Receptacle_GCT_USB4105-xx-A_16P_TopMnt_Horizontal",
    )
    u7 = Part(
        "Power_Protection", "USBLC6-2SC6", ref="U7",
        footprint="Package_TO_SOT_SMD:SOT-23-6",
    )
    r_cc = Part("Device", "R", dest=TEMPLATE, footprint="Resistor_SMD:R_0603_1608Metric")
    r1 = r_cc(ref="R1", value="5.1k")
    r2 = r_cc(ref="R2", value="5.1k")
    c1 = Part("Device", "C", ref="C1", value="10uF", footprint="Capacitor_SMD:C_0805_2012Metric")

    vbus += j1["A4", "A9", "B4", "B9"], c1[1], u7["VBUS"]
    gnd += j1["A1", "A12", "B1", "B12", "S1"], c1[2], u7["GND"]
    j1["SBU1", "SBU2"] += NC

    j1["A5"] += r1[1]
    j1["B5"] += r2[1]
    gnd += r1[2], r2[2]

    # Both receptacle rows are tied so either plug orientation works.
    usb_dp += j1["A6", "B6"], u7[1], u7[6]
    usb_dn += j1["A7", "B7"], u7[3], u7[4]
