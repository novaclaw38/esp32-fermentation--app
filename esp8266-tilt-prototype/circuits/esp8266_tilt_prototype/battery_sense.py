"""Battery Voltage Sense — ungated divider, sized for a TWO-STAGE ADC path.
Block from: architecture/block_diagram.md (block 3)
Interface nets: bat_plus, gnd, batt_sense_adc
Parts: R1 (10k), R2 (22k)

Ungated (no Q1/Q2), per hardware/PROTOTYPE_TEMP_GRAVITY.md's own guidance
for breadboard builds -- see architecture/design_risks.md.

Ratio recalculated after the user confirmed (multimeter/inspection) that
THIS SPECIFIC D1 Mini clone has its own onboard divider on A0 (~220k/100k,
ratio ~0.3125) between the header pin and the ESP8266 chip -- unlike a
genuine Wemos D1 Mini, which has none. This external divider targets the
board's ~3.2V header-pin input ceiling, not the chip's 0-1.0V limit
directly, since the onboard divider does that second stage:

  header_V = bat_plus * (R2/(R1+R2))      -- this divider
  chip_V   = header_V * (100k/320k)       -- the board's own divider

At a 4.2V max cell: header = 2.89V (margin under ~3.2V), chip = 0.90V
(margin under 1.0V). See architecture/net_plan.md for the full derivation
and firmware/fermentation_tilt_v1_esp8266/ for the matching multiplier.
"""
from skidl import *


@SubCircuit
def battery_sense(bat_plus, gnd, batt_sense_adc):
    r1 = Part("Device", "R", ref="R1", value="10k", footprint="Resistor_SMD:R_0603_1608Metric")
    r2 = Part("Device", "R", ref="R2", value="22k", footprint="Resistor_SMD:R_0603_1608Metric")

    bat_plus += r1[1]
    r1[2] += r2[1], batt_sense_adc
    gnd += r2[2]
