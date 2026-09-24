# DS18B20 (bare TO-92) — Firmware Fallback Reference (not wired on this build)

**Not used in this circuit as of the MCP9808 swap** — the TO-92 package
was too bulky for a PCB-mounted build, so the temperature sensor moved to
an MCP9808 I2C breakout sharing the GY-291's bus instead (see
`MCP9808_Breakout_SUMMARY.md`, `../architecture/net_plan.md`). Kept here
because the firmware still supports this sensor as an automatic fallback
(`mcp9808Begin()` runs first in `setup()`, DS18B20 only tried if that
fails) — useful reference if a DS18B20 probe is ever added back to `D6`
(GPIO12), which is currently unused/`NOCONNECT` on this build.

LCSC C9753 (Maxim/ADI, genuine) or C376006 (UMW, cheaper clone) — either
works with this firmware. PDF not fetched (simple, extremely standard
3-pin part, TO-92 pinout is unambiguous and silkscreen-labeled).

| Spec | Value |
|------|-------|
| Package | TO-92 (3-pin, through-hole) |
| Vcc | 3.0-5.5V |
| Interface | 1-Wire (single data line + pull-up) |
| Accuracy | ±0.5°C (genuine Maxim) or ±0.4°C (some clones) |
| Resolution | 9-12 bit, configurable |

## Pinout (flat face toward you, pins down)

| Pin | Function |
|---|---|
| 1 (left) | GND |
| 2 (middle) | DATA — to D1 Mini `D6` (GPIO12), with a 4.7kΩ pull-up to 3V3 |
| 3 (right) | VCC — to D1 Mini `3V3` |

## Notes

- Counterfeit DS18B20s are common and widespread — if readings are
  erratic or CRC-failing, suspect the sensor before the code (per
  `firmware/README.md`'s troubleshooting table for the same symptom on
  the production Hub sketch).
- The 4.7kΩ pull-up between DATA and 3V3 is required — some probe
  modules have it pre-fitted, check before adding a redundant one.
