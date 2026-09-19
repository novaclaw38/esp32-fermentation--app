"""D1 Mini (ESP8266) — module pin header, matching the user's board photo.
Block from: architecture/block_diagram.md (block 2)
Interface nets: d1mini_5v, d1mini_3v3, gnd, sda, scl, one_wire, batt_sense_adc, d0_rst_jumper
Parts: U1 (D1 Mini module, modeled as a 16-pin header matching silkscreen)

Pin numbering here is left-column-top-to-bottom (1-8), then
right-column-top-to-bottom (9-16), matching the physical board exactly:
  1=3V3 2=D8 3=D7 4=D6 5=D5 6=D0 7=A0 8=RST
  9=5V 10=GND 11=D4 12=D3 13=D2 14=D1 15=RX 16=TX
"""
from skidl import *


@SubCircuit
def d1_mini(d1mini_5v, d1mini_3v3, gnd, sda, scl, one_wire, batt_sense_adc, d0_rst_jumper):
    """ESP8266 D1 Mini. D3/D4/D8 (GPIO0/2/15) are boot-strapping pins and
    are deliberately left NC on this build — see architecture/design_risks.md.
    D0 must be wired to RST for deep-sleep wake (see net_plan.md).
    """
    u1 = Part(
        tool=SKIDL, name="D1_Mini_ESP8266", ref="U1", ref_prefix="U",
        footprint="Connector_PinHeader_2.54mm:PinHeader_2x08_P2.54mm_Vertical",
        pins=[
            Pin(num=1, name="3V3", func=Pin.types.PWROUT, orientation="L"),
            Pin(num=2, name="D8", func=Pin.types.NOCONNECT, orientation="L"),   # GPIO15, boot-strap, avoided
            Pin(num=3, name="D7", func=Pin.types.OUTPUT, orientation="L"),      # GPIO13, BATTERY_EN -- unused on this ungated build
            Pin(num=4, name="D6", func=Pin.types.BIDIR, orientation="L"),       # GPIO12, 1-Wire
            Pin(num=5, name="D5", func=Pin.types.NOCONNECT, orientation="L"),   # GPIO14, spare
            Pin(num=6, name="D0", func=Pin.types.OUTPUT, orientation="L"),      # GPIO16, deep-sleep wake source
            Pin(num=7, name="A0", func=Pin.types.INPUT, orientation="L"),       # ADC, 0-1.0V only
            Pin(num=8, name="RST", func=Pin.types.INPUT, orientation="L"),
            Pin(num=9, name="5V", func=Pin.types.PWRIN, orientation="L"),
            Pin(num=10, name="GND", func=Pin.types.PWRIN, orientation="L"),
            Pin(num=11, name="D4", func=Pin.types.NOCONNECT, orientation="L"),  # GPIO2, boot-strap, avoided
            Pin(num=12, name="D3", func=Pin.types.NOCONNECT, orientation="L"),  # GPIO0, boot-strap, avoided
            Pin(num=13, name="D2", func=Pin.types.BIDIR, orientation="L"),      # GPIO4, I2C SDA
            Pin(num=14, name="D1", func=Pin.types.BIDIR, orientation="L"),      # GPIO5, I2C SCL
            Pin(num=15, name="RX", func=Pin.types.NOCONNECT, orientation="L"),  # GPIO3, UART0 -- reserved for flashing
            Pin(num=16, name="TX", func=Pin.types.NOCONNECT, orientation="L"),  # GPIO1, UART0 -- reserved for flashing
        ],
    )

    d1mini_5v += u1["5V"]
    gnd += u1["GND"]
    d1mini_3v3 += u1["3V3"]
    sda += u1["D2"]
    scl += u1["D1"]
    one_wire += u1["D6"]
    batt_sense_adc += u1["A0"]
    d0_rst_jumper += u1["D0"], u1["RST"]

    # Boot-strapping pins and UART0 (reserved for flashing): NC on this build.
    u1["D8"] += NC
    u1["D5"] += NC
    u1["D4"] += NC
    u1["D3"] += NC
    u1["RX"] += NC
    u1["TX"] += NC
    # D7 (BATTERY_EN) is toggled by firmware for structural parity with the
    # production sketch but drives nothing physical on this ungated build.
    u1["D7"] += NC
