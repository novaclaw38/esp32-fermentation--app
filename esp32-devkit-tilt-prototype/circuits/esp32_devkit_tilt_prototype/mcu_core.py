"""ESP32 Dev Kit V1 — module pin header, logical (GPIO-number) view only.
Block from: architecture/block_diagram.md (block 2)
Interface nets: devkit_5v, devkit_3v3, gnd, sda, scl, batt_sense_adc, dht_data

Modeled by GPIO NUMBER, not physical header position -- unlike the
ESP8266 rig's D1 Mini part (a standardized silkscreen this project could
replicate 1:1), "ESP32 Dev Kit V1" is a cloned form factor whose 30-pin
physical layout varies between vendors even though the underlying
WROOM-32 module's GPIO numbering doesn't. See
datasheets/ESP32_DEVKIT_V1_SUMMARY.md and architecture/design_risks.md
for the full explanation. Only the pins this design actually uses are
modeled; the rest of the 30-pin header is real hardware but out of
scope for this schematic.
"""
from skidl import *


@SubCircuit
def mcu_core(devkit_5v, devkit_3v3, gnd, sda, scl, batt_sense_adc, dht_data):
    """ESP32 Dev Kit V1. GPIO25 (BATTERY_EN) is toggled by firmware for
    structural parity with the production/ESP8266 sketches but drives
    nothing physical on this ungated build -- declared NOCONNECT
    directly (not a typed pin wired to NC) to avoid the netlistsvg/elkjs
    rendering crash documented in the ESP8266 rig's d1_mini.py.

    GPIO4 was the DS18B20 fallback pin (unused/NOCONNECT) before the
    DHT11 swap; it's now the DHT11's single data line -- genuinely used,
    so BIDIR (the DHT protocol's host-writes-then-releases-to-read
    pattern is the same open-drain shape as I2C SDA, modeled the same
    way here).
    """
    u1 = Part(
        tool=SKIDL, name="ESP32_DevKit_V1", ref="U1", ref_prefix="U",
        footprint="Connector_PinHeader_2.54mm:PinHeader_1x08_P2.54mm_Vertical",
        pins=[
            Pin(num=1, name="VIN", func=Pin.types.PWRIN, orientation="L"),
            Pin(num=2, name="3V3", func=Pin.types.PWROUT, orientation="L"),
            Pin(num=3, name="GND", func=Pin.types.PWRIN, orientation="L"),
            Pin(num=4, name="GPIO23_SDA", func=Pin.types.BIDIR, orientation="L"),
            Pin(num=5, name="GPIO22_SCL", func=Pin.types.BIDIR, orientation="L"),  # master clock-drives SCL; BIDIR (not INPUT) so ERC sees a driver -- matches the ESP8266 rig's D1/SCL pin
            Pin(num=6, name="GPIO34_ADC", func=Pin.types.INPUT, orientation="L"),   # input-only pin, by design
            Pin(num=7, name="GPIO25_BATTERY_EN", func=Pin.types.NOCONNECT, orientation="L"),  # toggled but unwired -- ungated build
            Pin(num=8, name="GPIO4_DHT_DATA", func=Pin.types.BIDIR, orientation="L"),  # DHT11 single-wire data
        ],
    )

    devkit_5v += u1["VIN"]
    devkit_3v3 += u1["3V3"]
    gnd += u1["GND"]
    sda += u1["GPIO23_SDA"]
    scl += u1["GPIO22_SCL"]
    batt_sense_adc += u1["GPIO34_ADC"]
    dht_data += u1["GPIO4_DHT_DATA"]

    # Explicitly tied to NC (matching the ESP8266 rig's d1_mini.py
    # convention) even though already NOCONNECT-typed above.
    u1["GPIO25_BATTERY_EN"] += NC
