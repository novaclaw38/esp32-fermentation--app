"""Charger Module — user's TP4056 micro-USB breakout.
Block from: architecture/block_diagram.md (block 1)
Interface nets: bat_plus, gnd, devkit_5v

Modeled as its 4 exposed pads only (B+/B-/OUT+/OUT-) -- the micro-USB
connector and any onboard ICs are already part of the user's module, not
something this project places or verifies beyond the IC-count check in
architecture/module_selection.md (protection status unverified for this
specific physical board -- carry over the ESP8266 rig's verification
only if it's literally the same unit).
"""
from skidl import *


@SubCircuit
def charger(bat_plus, gnd, devkit_5v):
    """TP4056 breakout. OUT+ feeds the Dev Kit V1's VIN pin directly --
    its onboard regulator runs fine from a Li-ion cell voltage, no
    separate regulator needed (see SPEC.md Power section).
    """
    tp = Part(
        tool=SKIDL, name="TP4056_Breakout", ref="MOD1", ref_prefix="MOD",
        footprint="Connector_PinHeader_2.54mm:PinHeader_1x04_P2.54mm_Vertical",
        pins=[
            # PASSIVE, not PWROUT: this is a black-box connector view of
            # the module (see module docstring) -- B+/OUT+ are the same
            # internal node exposed on two pads, not two independent
            # sources. Marking both PWROUT reads to ERC as a driver
            # conflict on one net, which isn't real.
            Pin(num=1, name="B+", func=Pin.types.PASSIVE, orientation="L"),
            Pin(num=2, name="B-", func=Pin.types.PASSIVE, orientation="L"),
            Pin(num=3, name="OUT+", func=Pin.types.PASSIVE, orientation="L"),
            Pin(num=4, name="OUT-", func=Pin.types.PASSIVE, orientation="L"),
        ],
    )

    bat_plus += tp["B+"], tp["OUT+"]
    gnd += tp["B-"], tp["OUT-"]
    devkit_5v += tp["OUT+"]
