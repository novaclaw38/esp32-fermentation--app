"""DHT11 — temperature + humidity breakout, single-wire.
Block from: architecture/block_diagram.md (block 5)
Interface nets: devkit_3v3, gnd, dht_data
Parts: MOD4 (DHT11 breakout)

Replaces the MCP9808 (removed from sensor_bus.py) as the primary
temperature sensor. Modeled as the common 3-pin blue-PCB breakout
(VCC/DATA/GND, onboard pull-up already fitted) -- see
datasheets/DHT11_SUMMARY.md for the bare 4-pin sensor variant, which
needs an external 10k pull-up between DATA and 3V3 that this SubCircuit
does not add.
"""
from skidl import *


@SubCircuit
def dht11(devkit_3v3, gnd, dht_data):
    """DHT11 on its own GPIO (GPIO4) -- not on the I2C bus. Firmware
    reads it with the Adafruit "DHT sensor library"
    (github.com/adafruit/DHT-sensor-library), not DallasTemperature/
    OneWire (DHT11's timing protocol is similar in spirit to 1-Wire but
    not compatible with it).
    """
    dht = Part(
        tool=SKIDL, name="DHT11_Breakout", ref="MOD4", ref_prefix="MOD",
        footprint="Connector_PinHeader_2.54mm:PinHeader_1x03_P2.54mm_Vertical",
        pins=[
            Pin(num=1, name="VCC", func=Pin.types.PWRIN, orientation="L"),
            Pin(num=2, name="DATA", func=Pin.types.BIDIR, orientation="L"),
            Pin(num=3, name="GND", func=Pin.types.PWRIN, orientation="L"),
        ],
    )

    devkit_3v3 += dht["VCC"]
    gnd += dht["GND"]
    dht_data += dht["DATA"]
