"""Sensor Bus — GY-291 (ADXL345) breakout, I2C tilt only.
Block from: architecture/block_diagram.md (block 4)
Interface nets: devkit_3v3, gnd, sda, scl
Parts: MOD2 (GY-291 breakout)

Temperature moved off this I2C bus entirely -- MCP9808 removed in favor
of a DHT11 on its own single-wire pin, see dht11.py. This file now only
carries the accelerometer.
"""
from skidl import *


@SubCircuit
def sensor_bus(devkit_3v3, gnd, sda, scl):
    """GY-291 SDO tied to GND for I2C address 0x53 -- carried over from
    the ESP8266 rig's verification; see datasheets/GY-291_ADXL345_SUMMARY.md.
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

    devkit_3v3 += gy291["VCC"]
    gnd += gy291["GND"]
    sda += gy291["SDA"]
    scl += gy291["SCL"]
    gnd += gy291["SDO"]  # sets I2C address 0x53
    # CS is its own labeled header pin (confirmed on the ESP8266 rig's
    # physical board; carry over only if this is the same board -- see
    # design_risks.md). Wired explicitly to 3V3 rather than left
    # floating (indeterminate logic level risks an unwanted SPI-mode
    # switch or erratic I2C).
    #
    # symio="output" is a schematic-render-only hint (does not affect
    # ERC, which still uses func=INPUT) -- works around a netlistsvg/
    # elkjs crash when a single driver pin (U1's 3V3) fans out to two
    # input pins on the same part instance (here, GY-291's VCC and CS
    # both on devkit_3v3). Still needed even with MCP9808 gone, since
    # the fan-out pattern is unchanged -- see outputs/erc_report.md.
    gy291["CS"].symio = "output"
    devkit_3v3 += gy291["CS"]
