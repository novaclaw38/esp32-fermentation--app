"""Sensor Bus — GY-291 (ADXL345) breakout + MCP9808 breakout (I2C temp).
Block from: architecture/block_diagram.md (block 4)
Interface nets: devkit_3v3, gnd, sda, scl
Parts: MOD2 (GY-291 breakout), MOD3 (MCP9808 breakout)

Same module pairing as the ESP8266 sibling rig's sensor_bus.py -- MCP9808
preferred, DS18B20 available as a firmware fallback if wired separately
(see mcu_core.py's GPIO4).
"""
from skidl import *


@SubCircuit
def sensor_bus(devkit_3v3, gnd, sda, scl):
    """GY-291 SDO tied to GND for I2C address 0x53. MCP9808 at address
    0x18 assumes A0/A1/A2 are grounded on the breakout (true on Adafruit
    #1782 and most clones) -- verify on the specific board bought. Both
    caveats carried over from the ESP8266 rig; see
    datasheets/GY-291_ADXL345_SUMMARY.md and
    datasheets/MCP9808_Breakout_SUMMARY.md.
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
    mcp = Part(
        tool=SKIDL, name="MCP9808_Breakout", ref="MOD3", ref_prefix="MOD",
        footprint="Connector_PinHeader_2.54mm:PinHeader_1x05_P2.54mm_Vertical",
        pins=[
            Pin(num=1, name="VDD", func=Pin.types.PWRIN, orientation="L"),
            Pin(num=2, name="GND", func=Pin.types.PWRIN, orientation="L"),
            Pin(num=3, name="SCL", func=Pin.types.INPUT, orientation="L"),
            Pin(num=4, name="SDA", func=Pin.types.BIDIR, orientation="L"),
            Pin(num=5, name="ALERT", func=Pin.types.NOCONNECT, orientation="L"),
        ],
    )

    devkit_3v3 += gy291["VCC"], mcp["VDD"]
    gnd += gy291["GND"], mcp["GND"]
    sda += gy291["SDA"], mcp["SDA"]
    scl += gy291["SCL"], mcp["SCL"]
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
    # both on devkit_3v3). Same fix applied for the same reason in the
    # ESP8266 rig's sensor_bus.py.
    gy291["CS"].symio = "output"
    devkit_3v3 += gy291["CS"]
    mcp["ALERT"] += NC  # not used by this firmware
