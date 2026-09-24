"""ESP32-S3 MCU core — module, EN/IO0 circuitry, zero button, USB detect.
Interface nets: v3v3, gnd, vbus, usb_dp, usb_dn, sda, scl, adc_rdy,
                heater_en, pump_pwm, boost_en, buzzer, led_status
Parts: U1 (ESP32-S3-WROOM-1), SW2 (BOOT), SW3 (ZERO), R23-R27, C13-C16

GPIO map (fixed by firmware/leak_sniffer_v1 — change both together):
  IO8 SDA, IO9 SCL, IO10 ADC_RDY, IO4 HEATER_EN, IO5 PUMP_PWM,
  IO6 BOOST_EN, IO7 BUZZER, IO15 LED_STATUS, IO1 BTN_ZERO, IO12 VBUS_DET.
  IO0/IO3/IO45/IO46 are strapping pins and are left alone.
"""
from skidl import *


@SubCircuit
def mcu_core(v3v3, gnd, vbus, usb_dp, usb_dn, sda, scl, adc_rdy,
             heater_en, pump_pwm, boost_en, buzzer, led_status):
    """Native USB (IO19/IO20) replaces a USB-UART bridge: flashing and the
    serial console both go over the same USB-C port that charges.
    """
    u1 = Part("RF_Module", "ESP32-S3-WROOM-1", ref="U1", footprint="RF_Module:ESP32-S3-WROOM-1")
    sw_t = Part(
        "Switch", "SW_Push", dest=TEMPLATE,
        footprint="Button_Switch_SMD:SW_Push_1P1T_XKB_TS-1187A", value="TS-1187A-B-A-B",
    )
    sw2 = sw_t(ref="SW2")   # BOOT
    sw3 = sw_t(ref="SW3")   # ZERO / mark point

    r = Part("Device", "R", dest=TEMPLATE, footprint="Resistor_SMD:R_0603_1608Metric")
    r23 = r(ref="R23", value="10k")    # EN pull-up
    r24 = r(ref="R24", value="10k")    # IO0 pull-up
    r25 = r(ref="R25", value="10k")    # ZERO pull-up
    r26 = r(ref="R26", value="100k")   # VBUS detect divider
    r27 = r(ref="R27", value="100k")
    c = Part("Device", "C", dest=TEMPLATE, footprint="Capacitor_SMD:C_0603_1608Metric")
    c13 = c(ref="C13", value="1uF")    # EN RC delay
    c14 = c(ref="C14", value="100nF")
    c15 = Part("Device", "C", ref="C15", value="22uF", footprint="Capacitor_SMD:C_0805_2012Metric")
    c16 = c(ref="C16", value="100nF")  # ZERO debounce

    btn_zero = Net("BTN_ZERO")
    vbus_det = Net("VBUS_DET")

    v3v3 += u1["3V3"], c14[1], c15[1], r23[1], r24[1], r25[1]
    gnd += u1["GND"], c14[2], c15[2]

    u1["EN"] += r23[2], c13[1]
    gnd += c13[2]

    u1["IO0"] += r24[2], sw2[1]
    gnd += sw2[2]

    btn_zero += u1["IO1"], r25[2], sw3[1], c16[1]
    gnd += sw3[2], c16[2]

    # VBUS/2 (max ~2.6V) tells firmware it's on USB power / charging.
    vbus += r26[1]
    r26[2] += vbus_det
    vbus_det += r27[1], u1["IO12"]
    gnd += r27[2]

    usb_dp += u1["USB_D+"]
    usb_dn += u1["USB_D-"]
    sda += u1["IO8"]
    scl += u1["IO9"]
    adc_rdy += u1["IO10"]
    heater_en += u1["IO4"]
    pump_pwm += u1["IO5"]
    boost_en += u1["IO6"]
    buzzer += u1["IO7"]
    led_status += u1["IO15"]

    u1["IO2", "IO3", "IO11", "IO13", "IO14", "IO16", "IO17", "IO18",
       "IO21", "IO35", "IO36", "IO37", "IO38", "IO39", "IO40", "IO41",
       "IO42", "IO45", "IO46", "IO47", "IO48", "TXD0", "RXD0"] += NC
