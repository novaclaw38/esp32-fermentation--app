"""Battery, charger, soft power switch and 3V3 rail.
Interface nets: vbus, gnd, vsys, v3v3
Parts: U2 (MCP73831-2-OT), U3 (ME6211C33M5), Q3 (AO3401A), J2, SW1,
       D3, R3, R4, R5, C2, C3, C4, C5
"""
from skidl import *


@SubCircuit
def power(vbus, gnd, vsys, v3v3):
    """Single protected 18650 cell (the cell's own PCM does over-discharge
    and short-circuit protection, so there's no DW01A stage here).

    The slide switch only carries the P-FET's gate current: the pump and
    heater pull ~350mA from the cell, more than small slide switches are
    rated for. Charging goes straight to the cell, so the unit charges
    with the switch off.
    """
    u2 = Part("Battery_Management", "MCP73831-2-OT", ref="U2", footprint="Package_TO_SOT_SMD:SOT-23-5")
    u3 = Part("Regulator_Linear", "ME6211C33M5", ref="U3", footprint="Package_TO_SOT_SMD:SOT-23-5")
    q3 = Part("Transistor_FET", "AO3401A", ref="Q3", footprint="Package_TO_SOT_SMD:SOT-23")
    j2 = Part(
        "Connector_Generic", "Conn_01x02", ref="J2", value="18650 (protected)",
        footprint="Connector_JST:JST_PH_B2B-PH-K_1x02_P2.00mm_Vertical",
    )
    sw1 = Part("Switch", "SW_SPDT", ref="SW1", value="POWER", footprint="Button_Switch_SMD:SW_SPDT_PCM12")
    d3 = Part("Device", "LED", ref="D3", value="red", footprint="LED_SMD:LED_0603_1608Metric")

    r = Part("Device", "R", dest=TEMPLATE, footprint="Resistor_SMD:R_0603_1608Metric")
    r3 = r(ref="R3", value="2k")      # PROG: 1000V / 2k = 500mA charge (0.2C on 2500mAh)
    r4 = r(ref="R4", value="1k")      # charge LED
    r5 = r(ref="R5", value="100k")    # P-FET gate pull-up (off)
    c_bulk = Part("Device", "C", dest=TEMPLATE, footprint="Capacitor_SMD:C_0805_2012Metric")
    c2 = c_bulk(ref="C2", value="4.7uF")   # charger VDD
    c3 = c_bulk(ref="C3", value="10uF")    # cell / charger VBAT
    c_ldo = Part("Device", "C", dest=TEMPLATE, footprint="Capacitor_SMD:C_0603_1608Metric")
    c4 = c_ldo(ref="C4", value="1uF")
    c5 = c_ldo(ref="C5", value="1uF")

    bat_plus = Net("BAT_PLUS")
    gate = Net("PWR_GATE")

    # Charger: VBUS -> cell. STAT sinks while charging, lighting D3.
    vbus += u2["V_{DD}"], c2[1], r4[1]
    gnd += u2["V_{SS}"], c2[2]
    u2["V_{BAT}"] += bat_plus
    u2["PROG"] += r3[1]
    gnd += r3[2]
    r4[2] += d3["A"]
    d3["K"] += u2["STAT"]

    bat_plus += j2[1], c3[1]
    gnd += j2[2], c3[2]

    # Soft switch: gate pulled to source (off); SW1 grounds it (on).
    bat_plus += q3["S"], r5[1]
    gate += q3["G"], r5[2], sw1["B"]
    sw1["A"] += gnd
    sw1["C"] += NC
    q3["D"] += vsys

    # 3V3 LDO: 100mV dropout at 100mA keeps it in regulation to ~3.4V cell.
    vsys += u3["V_{IN}"], u3["CE"], c4[1]
    gnd += u3["V_{SS}"], c4[2], c5[2]
    u3["V_{OUT}"] += v3v3, c5[1]
    u3["NC"] += NC
