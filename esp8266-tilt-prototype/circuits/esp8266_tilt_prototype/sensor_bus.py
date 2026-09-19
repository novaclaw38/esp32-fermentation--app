"""Sensor Bus — GY-291 (ADXL345) breakout + DS18B20 bench probe.
Block from: architecture/block_diagram.md (block 4)
Interface nets: d1mini_3v3, gnd, sda, scl, one_wire
Parts: MOD2 (GY-291 breakout), U2 (DS18B20), R3 (4.7k pull-up)
"""
from skidl import *


@SubCircuit
def sensor_bus(d1mini_3v3, gnd, sda, scl, one_wire):
    """GY-291 SDO tied to GND for I2C address 0x53 -- confirmed gotcha,
    see datasheets/GY-291_ADXL345_SUMMARY.md. DS18B20 pull-up only needed
    if the probe doesn't already carry one -- check before doubling up.
    """
    gy291 = Part(
        tool=SKIDL, name="GY-291_Breakout", ref="MOD2", ref_prefix="MOD",
        footprint="Connector_PinHeader_2.54mm:PinHeader_1x06_P2.54mm_Vertical",
        pins=[
            Pin(num=1, name="VCC", func=Pin.types.PWRIN, orientation="L"),
            Pin(num=2, name="GND", func=Pin.types.PWRIN, orientation="L"),
            Pin(num=3, name="SDA", func=Pin.types.BIDIR, orientation="L"),
            Pin(num=4, name="SCL", func=Pin.types.INPUT, orientation="L"),
            Pin(num=5, name="SDO", func=Pin.types.INPUT, orientation="L"),
            Pin(num=6, name="CS", func=Pin.types.INPUT, orientation="L"),
        ],
    )
    u2 = Part(
        "Sensor_Temperature", "DS18B20", ref="U2",
        footprint="Package_TO_SOT_THT:TO-92",
    )
    r3 = Part("Device", "R", ref="R3", value="4.7k", footprint="Resistor_SMD:R_0603_1608Metric")

    d1mini_3v3 += gy291["VCC"], u2["V_{DD}"], r3[1]
    gnd += gy291["GND"], u2["GND"]
    sda += gy291["SDA"]
    scl += gy291["SCL"]
    gnd += gy291["SDO"]  # sets I2C address 0x53
    # CS is its own labeled header pin on the user's board (confirmed by
    # photo), same as SDO -- not assumed internally tied. Wire explicitly
    # to 3V3 rather than leaving a CMOS input floating (indeterminate
    # logic level risks an unwanted SPI-mode switch or erratic I2C).
    d1mini_3v3 += gy291["CS"]

    one_wire += r3[2], u2["DQ"]
