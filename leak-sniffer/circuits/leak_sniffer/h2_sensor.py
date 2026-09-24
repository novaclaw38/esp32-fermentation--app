"""Hydrogen sensing — TGS2616-C01, ADS1115 16-bit ADC, SHT40 compensation.
Interface nets: v5, v3v3, gnd, vsys, sda, scl, heater_en, adc_rdy
Parts: U8 (TGS2616-C01), U5 (ADS1115), U6 (SHT40), Q1 (AO3400A),
       R9-R18, C9-C12

TGS2616-C01 (Figaro product information rev 07/23): MOS hydrogen sensor,
TO-5, 30-3000ppm H2. VH = VC = 5.0 +/-0.2V; heater ~59 ohm, 56mA, 280mW.
RL >= 0.45k; sensor power Ps <= 15mW. Pins: 1, 4 heater; 2 sensor (-);
3 sensor (+). Rs = (VC / VRL - 1) x RL.
"""
from skidl import *


@SubCircuit
def h2_sensor(v5, v3v3, gnd, vsys, sda, scl, heater_en, adc_rdy):
    """RL is two 4.99k resistors in series and the ADC reads the midpoint.
    That halves VRL, so AIN0 never exceeds 2.5V on a 5V circuit and stays
    inside the 3.3V ADS1115's input range. Worst-case sensor power is at
    Rs = RL: (5V/2)^2 / 9.98k = 0.63mW, far under 15mW.

    AIN1 reads V5 (halved) so firmware computes Rs ratiometrically and
    boost ripple/drift cancels. AIN2 reads the cell (halved).
    """
    u8 = Part(
        tool=SKIDL, name="TGS2616-C01", ref="U8", ref_prefix="U",
        # TO-5 4-lead on a 5.1mm pin circle per Figaro's drawing. Check the
        # KiCad pad numbering against Figaro's bottom view before layout.
        footprint="Package_TO_SOT_THT:TO-5-4",
        pins=[
            Pin(num=1, name="H1", func=Pin.types.PASSIVE, orientation="L"),
            Pin(num=2, name="S-", func=Pin.types.PASSIVE, orientation="L"),
            Pin(num=3, name="S+", func=Pin.types.PASSIVE, orientation="L"),
            Pin(num=4, name="H2", func=Pin.types.PASSIVE, orientation="L"),
        ],
    )
    u5 = Part("Analog_ADC", "ADS1115IDGS", ref="U5", footprint="Package_SO:TSSOP-10_3x3mm_P0.5mm")
    u6 = Part(
        "Sensor_Humidity", "SHT4x", ref="U6", value="SHT40-AD1B",
        footprint="Sensor_Humidity:Sensirion_DFN-4_1.5x1.5mm_P0.8mm_SHT4x_NoCentralPad",
    )
    q1 = Part("Transistor_FET", "AO3400A", ref="Q1", footprint="Package_TO_SOT_SMD:SOT-23")

    r = Part("Device", "R", dest=TEMPLATE, footprint="Resistor_SMD:R_0603_1608Metric")
    r9 = r(ref="R9", value="4.99k 0.1%")    # RL upper half
    r10 = r(ref="R10", value="4.99k 0.1%")  # RL lower half
    r11 = r(ref="R11", value="100k 1%")     # V5 divider
    r12 = r(ref="R12", value="100k 1%")
    r13 = r(ref="R13", value="100k 1%")     # VSYS divider
    r14 = r(ref="R14", value="100k 1%")
    r15 = r(ref="R15", value="4.7k")        # SDA pull-up
    r16 = r(ref="R16", value="4.7k")        # SCL pull-up
    r17 = r(ref="R17", value="10k")         # ALERT/RDY pull-up (open drain)
    r18 = r(ref="R18", value="100k")        # heater gate pull-down
    c = Part("Device", "C", dest=TEMPLATE, footprint="Capacitor_SMD:C_0603_1608Metric")
    c9 = c(ref="C9", value="100nF")    # AIN0 filter, tau = 2.5k x 100n = 0.25ms
    c10 = c(ref="C10", value="100nF")  # ADS1115 VDD
    c11 = c(ref="C11", value="100nF")  # SHT40 VDD
    c12 = c(ref="C12", value="100nF")  # AIN2 filter (high-impedance divider)

    h2_sense = Net("H2_SENSE")
    rl_top = Net("RL_TOP")
    v5_sense = Net("V5_SENSE")
    vsys_sense = Net("VSYS_SENSE")
    heater_low = Net("HEATER_LOW")

    # Heater: high side on V5, low side switched so it's off at idle.
    v5 += u8["H1"]
    u8["H2"] += heater_low
    heater_low += q1["D"]
    gnd += q1["S"]
    heater_en += q1["G"], r18[1]
    gnd += r18[2]

    # Sensor: VC = V5 -> Rs -> RL(upper, lower) -> GND.
    v5 += u8["S+"]
    u8["S-"] += rl_top
    rl_top += r9[1]
    r9[2] += h2_sense
    h2_sense += r10[1], c9[1], u5["AIN0"]
    gnd += r10[2], c9[2]

    v5 += r11[1]
    r11[2] += v5_sense
    v5_sense += r12[1], u5["AIN1"]
    gnd += r12[2]

    vsys += r13[1]
    r13[2] += vsys_sense
    vsys_sense += r14[1], c12[1], u5["AIN2"]
    gnd += r14[2], c12[2]

    gnd += u5["AIN3"]  # unused: grounded rather than floating

    # ADS1115 at 0x48 (ADDR -> GND). SHT40-AD1B is fixed at 0x44.
    v3v3 += u5["VDD"], c10[1], u6["VDD"], c11[1], r15[1], r16[1], r17[1]
    gnd += u5["GND"], u5["ADDR"], c10[2], u6["VSS"], c11[2]
    sda += u5["SDA"], u6["SDA"], r15[2]
    scl += u5["SCL"], u6["SCL"], r16[2]
    adc_rdy += u5["ALERT/RDY"], r17[2]
