"""DHT11 — bare 4-pin sensor (Asair), temperature + humidity, single-wire.
Block from: architecture/block_diagram.md (block 5)
Interface nets: devkit_3v3, gnd, dht_data
Parts: MOD4 (DHT11 sensor), R3 (pull-up)

Replaces the MCP9808 (removed from sensor_bus.py) as the primary
temperature sensor. Confirmed by photo: this is the bare 4-pin Asair
DHT11 (VDD/DATA/NC/GND silkscreen order, per the datasheet), not the
3-pin blue-PCB breakout with an onboard pull-up -- R3 below adds the
external 10k pull-up this variant needs between DATA and 3V3. See
datasheets/DHT11_SUMMARY.md.
"""
from skidl import *


@SubCircuit
def dht11(devkit_3v3, gnd, dht_data):
    """DHT11 on its own GPIO (GPIO4) -- not on the I2C bus. Firmware
    reads it with the Adafruit "DHT sensor library"
    (github.com/adafruit/DHT-sensor-library), not DallasTemperature/
    OneWire (DHT11's timing protocol is similar in spirit to 1-Wire but
    not compatible with it).

    Pin 3 (NC) is a real, unpopulated pin on the bare sensor -- some
    datasheets list it as a factory-test pin, not user-connectable.
    """
    dht = Part(
        tool=SKIDL, name="DHT11_Bare", ref="MOD4", ref_prefix="MOD",
        footprint="Connector_PinHeader_2.54mm:PinHeader_1x04_P2.54mm_Vertical",
        pins=[
            Pin(num=1, name="VDD", func=Pin.types.PWRIN, orientation="L"),
            Pin(num=2, name="DATA", func=Pin.types.BIDIR, orientation="L"),
            Pin(num=3, name="NC", func=Pin.types.NOCONNECT, orientation="L"),
            Pin(num=4, name="GND", func=Pin.types.PWRIN, orientation="L"),
        ],
    )
    r3 = Part("Device", "R", ref="R3", value="10k", footprint="Resistor_SMD:R_0603_1608Metric")

    devkit_3v3 += dht["VDD"]
    gnd += dht["GND"]
    dht["NC"] += NC

    # External pull-up -- this bare sensor has none onboard, unlike the
    # 3-pin breakout variant. Same fan-out shape (one driver, two sinks
    # on different parts) as other 2-endpoint pull-up nets elsewhere in
    # this repo; not the same-part CS/VCC pattern that needed the
    # symio="output" netlistsvg workaround in sensor_bus.py.
    devkit_3v3 += r3[1]
    r3[2] += dht_data
    dht_data += dht["DATA"]
