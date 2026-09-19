"""ESP8266 D1 Mini Bench Prototype — assembly.
Wires all blocks together, runs ERC, generates netlist + BOM.
Run: KICAD7_SYMBOL_DIR=/usr/share/kicad/symbols .venv/bin/python -m circuits.esp8266_tilt_prototype
"""
from skidl import *

set_default_tool(KICAD7)

from .charger import charger
from .d1_mini import d1_mini
from .battery_sense import battery_sense
from .sensor_bus import sensor_bus

BAT_PLUS = Net("BAT_PLUS")
BAT_PLUS.drive = POWER
GND = Net("GND")
GND.drive = POWER
D1MINI_3V3 = Net("D1MINI_3V3")
D1MINI_3V3.drive = POWER

SDA = Net("SDA")
SCL = Net("SCL")
BATT_SENSE_ADC = Net("BATT_SENSE_ADC")
D0_RST_JUMPER = Net("D0_RST_JUMPER")

# NOTE: d1mini_5v is deliberately the SAME net as BAT_PLUS (TP4056's OUT+
# feeds the D1 Mini's 5V pin directly, no separate regulation stage) --
# passing distinct Net objects here would just merge into one with a
# harmless-but-noisy ERC warning, so charger.py already wires OUT+ to
# both callers' nets; we pass BAT_PLUS for both roles.
charger(bat_plus=BAT_PLUS, gnd=GND, d1mini_5v=BAT_PLUS)
d1_mini(
    d1mini_5v=BAT_PLUS, d1mini_3v3=D1MINI_3V3, gnd=GND,
    sda=SDA, scl=SCL,
    batt_sense_adc=BATT_SENSE_ADC, d0_rst_jumper=D0_RST_JUMPER,
)
battery_sense(bat_plus=BAT_PLUS, gnd=GND, batt_sense_adc=BATT_SENSE_ADC)
sensor_bus(d1mini_3v3=D1MINI_3V3, gnd=GND, sda=SDA, scl=SCL)

if __name__ == "__main__":
    ERC()
    generate_netlist(file_="outputs/esp8266_tilt_prototype.net")
    generate_xml(file_="outputs/esp8266_tilt_prototype_bom.xml")
