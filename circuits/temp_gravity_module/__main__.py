"""Temp + Gravity Module — assembly.
Wires all blocks together, runs ERC, generates netlist + BOM.
Run: KICAD7_SYMBOL_DIR=/usr/share/kicad/symbols .venv/bin/python -m circuits.temp_gravity_module
"""
from skidl import *

set_default_tool(KICAD7)

from .power_input import power_input
from .charge_protection import charge_protection
from .regulation import regulation
from .battery_sense import battery_sense
from .mcu_core import mcu_core
from .sensor_bus import sensor_bus

VBUS = Net("VBUS")
VBUS.drive = POWER
GND = Net("GND")
GND.drive = POWER
BAT_PLUS = Net("BAT_PLUS")
BAT_PLUS.drive = POWER
V3V3 = Net("V3V3")
V3V3.drive = POWER

SDA = Net("SDA")
SCL = Net("SCL")
DIV_EN = Net("DIV_EN")
BATT_SENSE_ADC = Net("BATT_SENSE_ADC")

power_input(vbus=VBUS, gnd=GND)
charge_protection(vbus=VBUS, bat_plus=BAT_PLUS, gnd=GND, v3v3=V3V3)
regulation(bat_plus=BAT_PLUS, v3v3=V3V3, gnd=GND)
battery_sense(bat_plus=BAT_PLUS, gnd=GND, div_en=DIV_EN, batt_sense_adc=BATT_SENSE_ADC)
mcu_core(v3v3=V3V3, gnd=GND, sda=SDA, scl=SCL, div_en=DIV_EN, batt_sense_adc=BATT_SENSE_ADC)
sensor_bus(v3v3=V3V3, gnd=GND, sda=SDA, scl=SCL)

if __name__ == "__main__":
    ERC()
    generate_netlist(file_="outputs/temp_gravity_module.net")
    generate_xml(file_="outputs/temp_gravity_module_bom.xml")
