"""I2C Sensor Bus — ADXL345 (tilt) + MCP9808 (temperature).
Block from: architecture/block_diagram.md (block 6)
Interface nets: v3v3, gnd, sda, scl
Parts: U6 (ADXL345), U7 (MCP9808), R7, R8, C10, C11, C12

ADXL345 uses the standard, widely-published 14-pin LGA pinout (no exact
symbol exists in the standard KiCad library; ADXL343 is a different part
and was not substituted). This pinout is well-established public
information, unlike DW01A/FS8205A in charge_protection.py.
"""
from skidl import *


@SubCircuit
def sensor_bus(v3v3, gnd, sda, scl):
    """Shared I2C bus. ADXL345 addr 0x53 (SDO->GND), MCP9808 addr 0x18
    (A0/A1/A2->GND). MCP9808 needs thermal bonding to the housing wall at
    layout time — see architecture/design_risks.md.
    """
    u6 = Part(
        tool=SKIDL, name="ADXL345BCCZ-RL7", ref="U6", ref_prefix="U",
        # Closest standard-library match by package family/size; ADXL345's
        # exact LGA-14 3x5mm pad layout (0.55mm/0.8mm mixed pitch) should
        # be checked against the datasheet mechanical drawing before
        # fab — same caveat class as DW01A/FS8205A's pin numbering.
        footprint="Package_LGA:LGA-14_3x5mm_P0.8mm_LayoutBorder1x6y",
        pins=[
            Pin(num=1, name="VDDIO", func=Pin.types.PWRIN),
            Pin(num=2, name="GND", func=Pin.types.PWRIN),
            Pin(num=3, name="RESERVED1", func=Pin.types.NOCONNECT),
            Pin(num=4, name="GND2", func=Pin.types.PWRIN),
            Pin(num=5, name="RESERVED2", func=Pin.types.NOCONNECT),
            Pin(num=6, name="VS", func=Pin.types.PWRIN),
            Pin(num=7, name="CS", func=Pin.types.INPUT),
            Pin(num=8, name="INT1", func=Pin.types.NOCONNECT),
            Pin(num=9, name="INT2", func=Pin.types.NOCONNECT),
            Pin(num=10, name="NC", func=Pin.types.NOCONNECT),
            Pin(num=11, name="RESERVED3", func=Pin.types.NOCONNECT),
            Pin(num=12, name="SDO", func=Pin.types.INPUT),
            Pin(num=13, name="SDA", func=Pin.types.BIDIR),
            Pin(num=14, name="SCL", func=Pin.types.INPUT),
        ],
    )
    u7 = Part(
        "Sensor_Temperature", "MCP9808_MSOP", ref="U7",
        footprint="Package_SO:MSOP-8_3x3mm_P0.65mm",
    )

    r_i2c = Part("Device", "R", dest=TEMPLATE, footprint="Resistor_SMD:R_0603_1608Metric")
    r7 = r_i2c(ref="R7", value="4.7k")
    r8 = r_i2c(ref="R8", value="4.7k")

    c10 = Part("Device", "C", ref="C10", value="0.1uF", footprint="Capacitor_SMD:C_0603_1608Metric")
    c11 = Part("Device", "C", ref="C11", value="1uF", footprint="Capacitor_SMD:C_0603_1608Metric")
    c12 = Part("Device", "C", ref="C12", value="0.1uF", footprint="Capacitor_SMD:C_0603_1608Metric")

    # I2C bus with pull-ups
    v3v3 += r7[1], r8[1]
    sda += r7[2], u6["SDA"], u7["SDA"]
    scl += r8[2], u6["SCL"], u7["SCL"]

    # ADXL345: I2C mode (CS->3V3), address 0x53 (SDO->GND)
    v3v3 += u6["VDDIO"], u6["VS"], u6["CS"], c10[1], c11[1]
    gnd += u6["GND"], u6["GND2"], u6["SDO"], c10[2], c11[2]
    u6["INT1"] += NC
    u6["INT2"] += NC
    u6["NC"] += NC
    u6["RESERVED1"] += NC
    u6["RESERVED2"] += NC
    u6["RESERVED3"] += NC

    # MCP9808: address 0x18 (A0/A1/A2->GND), decoupling added beyond the
    # original BOM (which had none for this part).
    v3v3 += u7["V_{DD}"], c12[1]
    gnd += u7["GND"], u7["A0"], u7["A1"], u7["A2"], c12[2]
    u7["Alert"] += NC
