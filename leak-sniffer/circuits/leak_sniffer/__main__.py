"""Leak Sniffer — assembly.
Wires all blocks together, runs ERC, generates netlist + BOM.
Run: KICAD8_SYMBOL_DIR=/usr/share/kicad/symbols .venv/bin/python -m circuits.leak_sniffer
"""
from skidl import *

set_default_tool(KICAD8)

from .usb_power import usb_power
from .power import power
from .boost_5v import boost_5v
from .h2_sensor import h2_sensor
from .pump_alert import pump_alert
from .mcu_core import mcu_core

VBUS = Net("VBUS")
VBUS.drive = POWER
GND = Net("GND")
GND.drive = POWER
VSYS = Net("VSYS")
VSYS.drive = POWER
V3V3 = Net("V3V3")
V3V3.drive = POWER
V5 = Net("V5")
V5.drive = POWER

USB_DP = Net("USB_DP")
USB_DN = Net("USB_DN")
SDA = Net("SDA")
SCL = Net("SCL")
ADC_RDY = Net("ADC_RDY")
HEATER_EN = Net("HEATER_EN")
PUMP_PWM = Net("PUMP_PWM")
BOOST_EN = Net("BOOST_EN")
BUZZER = Net("BUZZER")
LED_STATUS = Net("LED_STATUS")

usb_power(vbus=VBUS, gnd=GND, usb_dp=USB_DP, usb_dn=USB_DN)
power(vbus=VBUS, gnd=GND, vsys=VSYS, v3v3=V3V3)
boost_5v(vsys=VSYS, gnd=GND, v5=V5, boost_en=BOOST_EN)
h2_sensor(v5=V5, v3v3=V3V3, gnd=GND, vsys=VSYS, sda=SDA, scl=SCL,
          heater_en=HEATER_EN, adc_rdy=ADC_RDY)
pump_alert(v5=V5, gnd=GND, pump_pwm=PUMP_PWM, buzzer=BUZZER, led_status=LED_STATUS)
mcu_core(v3v3=V3V3, gnd=GND, vbus=VBUS, usb_dp=USB_DP, usb_dn=USB_DN,
         sda=SDA, scl=SCL, adc_rdy=ADC_RDY, heater_en=HEATER_EN,
         pump_pwm=PUMP_PWM, boost_en=BOOST_EN, buzzer=BUZZER,
         led_status=LED_STATUS)

if __name__ == "__main__":
    ERC()
    generate_netlist(file_="outputs/leak_sniffer.net")
    generate_xml(file_="outputs/leak_sniffer_bom.xml")
