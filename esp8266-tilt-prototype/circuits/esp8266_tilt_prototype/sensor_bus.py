"""Sensor Bus — GY-291 (ADXL345) breakout + MCP9808 breakout (I2C temp).
Block from: architecture/block_diagram.md (block 4)
Interface nets: d1mini_3v3, gnd, sda, scl
Parts: MOD2 (GY-291 breakout), MOD3 (MCP9808 breakout)

Swapped from a DS18B20 TO-92 probe (bulky, needs its own GPIO + pull-up)
to an MCP9808 breakout sharing this same I2C bus -- no extra wiring
versus the ADXL345 already on it. The firmware already prefers an
MCP9808 when present and only falls back to DS18B20 otherwise
(mcp9808Begin() runs before the DS18B20 path in setup()), so this is a
wiring-only change -- no firmware edit needed. See
architecture/design_risks.md for the one thing to verify on whichever
specific breakout gets bought (A0/A1/A2 address-pin default).
"""
from skidl import *


@SubCircuit
def sensor_bus(d1mini_3v3, gnd, sda, scl):
    """GY-291 SDO tied to GND for I2C address 0x53 -- confirmed gotcha,
    see datasheets/GY-291_ADXL345_SUMMARY.md. MCP9808 at address 0x18
    assumes A0/A1/A2 are already grounded on the breakout (true on
    Adafruit #1782 and most clones) -- verify on the specific board
    bought before assuming it, same spirit as the GY-291 SDO/CS check.
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

    d1mini_3v3 += gy291["VCC"], mcp["VDD"]
    gnd += gy291["GND"], mcp["GND"]
    sda += gy291["SDA"], mcp["SDA"]
    scl += gy291["SCL"], mcp["SCL"]
    gnd += gy291["SDO"]  # sets I2C address 0x53
    # CS is its own labeled header pin on the user's board (confirmed by
    # photo), same as SDO -- not assumed internally tied. Wire explicitly
    # to 3V3 rather than leaving a CMOS input floating (indeterminate
    # logic level risks an unwanted SPI-mode switch or erratic I2C).
    # symio="output" is a schematic-render-only hint (does not affect ERC,
    # which still uses func=INPUT) -- works around a netlistsvg/elkjs crash
    # when a single driver pin (U1 3V3) fans out to two input pins on the
    # same part instance (here, GY-291's VCC and CS both on d1mini_3v3).
    gy291["CS"].symio = "output"
    d1mini_3v3 += gy291["CS"]
    mcp["ALERT"] += NC  # not used by this firmware
