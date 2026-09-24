"""Sample pump driver, buzzer and status LED.
Interface nets: v5, gnd, pump_pwm, buzzer, led_status
Parts: Q2 (AO3400A), D2 (SS34), J3, BZ1, D4, R19, R20, R21, R22
"""
from skidl import *


@SubCircuit
def pump_alert(v5, gnd, pump_pwm, buzzer, led_status):
    """The pump pulls air from the probe tip across the sensor chamber, the
    way professional sniffers work: a fixed flow makes readings repeatable
    and response faster than passive diffusion. 5V micro diaphragm pump,
    ~150mA, PWM speed control. D2 clamps the motor's flyback.
    """
    q2 = Part("Transistor_FET", "AO3400A", ref="Q2", footprint="Package_TO_SOT_SMD:SOT-23")
    d2 = Part("Diode", "SS34", ref="D2", footprint="Diode_SMD:D_SMA")
    j3 = Part(
        "Connector_Generic", "Conn_01x02", ref="J3", value="PUMP",
        footprint="Connector_JST:JST_PH_B2B-PH-K_1x02_P2.00mm_Vertical",
    )
    bz1 = Part(
        "Device", "Buzzer", ref="BZ1", value="passive piezo 12mm",
        footprint="Buzzer_Beeper:Buzzer_12x9.5RM7.6",
    )
    d4 = Part("Device", "LED", ref="D4", value="green", footprint="LED_SMD:LED_0603_1608Metric")

    r = Part("Device", "R", dest=TEMPLATE, footprint="Resistor_SMD:R_0603_1608Metric")
    r19 = r(ref="R19", value="100k")  # pump gate pull-down
    r20 = r(ref="R20", value="100")   # buzzer series
    r21 = r(ref="R21", value="1k")    # status LED
    r22 = r(ref="R22", value="100")   # pump gate series (edge-rate limit for PWM)

    pump_low = Net("PUMP_LOW")

    v5 += j3[1], d2["K"]
    j3[2] += pump_low
    pump_low += d2["A"], q2["D"]
    gnd += q2["S"]
    pump_pwm += r22[1]
    r22[2] += q2["G"], r19[1]
    gnd += r19[2]

    buzzer += r20[1]
    r20[2] += bz1[1]
    gnd += bz1[2]

    led_status += r21[1]
    r21[2] += d4["A"]
    gnd += d4["K"]
