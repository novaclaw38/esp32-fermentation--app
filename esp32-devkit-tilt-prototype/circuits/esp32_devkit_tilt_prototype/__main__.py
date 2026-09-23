"""ESP32 Dev Kit V1 Bench Prototype — assembly.
Wires all blocks together, runs ERC, generates netlist + BOM.
Run: KICAD7_SYMBOL_DIR=/usr/share/kicad/symbols .venv/bin/python -m circuits.esp32_devkit_tilt_prototype
"""
from skidl import *

set_default_tool(KICAD7)

from .charger import charger
from .mcu_core import mcu_core
from .battery_sense import battery_sense
from .sensor_bus import sensor_bus

BAT_PLUS = Net("BAT_PLUS")
BAT_PLUS.drive = POWER
GND = Net("GND")
GND.drive = POWER
DEVKIT_3V3 = Net("DEVKIT_3V3")
DEVKIT_3V3.drive = POWER

SDA = Net("SDA")
SCL = Net("SCL")
BATT_SENSE_ADC = Net("BATT_SENSE_ADC")

# NOTE: devkit_5v is deliberately the SAME net as BAT_PLUS (TP4056's OUT+
# feeds the Dev Kit V1's VIN pin directly, no separate regulation stage) --
# passing distinct Net objects here would just merge into one with a
# harmless-but-noisy ERC warning, so charger.py already wires OUT+ to
# both callers' nets; we pass BAT_PLUS for both roles.
charger(bat_plus=BAT_PLUS, gnd=GND, devkit_5v=BAT_PLUS)
mcu_core(
    devkit_5v=BAT_PLUS, devkit_3v3=DEVKIT_3V3, gnd=GND,
    sda=SDA, scl=SCL, batt_sense_adc=BATT_SENSE_ADC,
)
battery_sense(bat_plus=BAT_PLUS, gnd=GND, batt_sense_adc=BATT_SENSE_ADC)
sensor_bus(devkit_3v3=DEVKIT_3V3, gnd=GND, sda=SDA, scl=SCL)

if __name__ == "__main__":
    ERC()
    generate_netlist(file_="outputs/esp32_devkit_tilt_prototype.net")
    generate_xml(file_="outputs/esp32_devkit_tilt_prototype_bom.xml")
