"""5V boost for the sensor heater and sample pump.
Interface nets: vsys, gnd, v5, boost_en
Parts: U4 (MT3608), L1, D1, R6, R7, R8, C6, C7, C8
"""
from skidl import *


@SubCircuit
def boost_5v(vsys, gnd, v5, boost_en):
    """MT3608 at 4.99V: VFB 0.6V x (1 + 73.2k/10k). The TGS2616 heater
    needs 5.0 +/-0.2V. Load: heater 56mA + pump ~150mA.

    With EN low the MT3608 doesn't disconnect: V5 sits at VSYS minus a
    diode drop. The heater and pump have their own low-side switches, so
    nothing draws from it then.
    """
    u4 = Part("Regulator_Switching", "MT3608", ref="U4", footprint="Package_TO_SOT_SMD:SOT-23-6")
    l1 = Part("Device", "L", ref="L1", value="22uH", footprint="Inductor_SMD:L_Taiyo-Yuden_NR-40xx")
    d1 = Part("Diode", "SS34", ref="D1", footprint="Diode_SMD:D_SMA")

    r = Part("Device", "R", dest=TEMPLATE, footprint="Resistor_SMD:R_0603_1608Metric")
    r6 = r(ref="R6", value="73.2k")
    r7 = r(ref="R7", value="10k")
    r8 = r(ref="R8", value="100k")   # EN pull-down: boost off until firmware enables it
    c = Part("Device", "C", dest=TEMPLATE, footprint="Capacitor_SMD:C_0805_2012Metric")
    c6 = c(ref="C6", value="22uF")
    c7 = c(ref="C7", value="22uF")
    c8 = c(ref="C8", value="22uF")

    sw = Net("BOOST_SW")
    fb = Net("BOOST_FB")

    vsys += u4["IN"], l1[1], c6[1]
    gnd += u4["GND"], c6[2]
    l1[2] += sw
    sw += u4["SW"], d1["A"]
    d1["K"] += v5
    v5 += c7[1], c8[1], r6[1]
    gnd += c7[2], c8[2]

    r6[2] += fb
    fb += u4["FB"], r7[1]
    gnd += r7[2]

    boost_en += u4["EN"], r8[1]
    gnd += r8[2]
    u4["NC"] += NC
