# ERC Report — esp32_devkit_tilt_prototype

**0 errors, 0 warnings. Circuit is PASS.**

Run: `KICAD7_SYMBOL_DIR=/usr/share/kicad/symbols KICAD7_FOOTPRINT_DIR=/usr/share/kicad/footprints .venv/bin/python -m circuits.esp32_devkit_tilt_prototype` — 2026-09-23 (re-run after the DHT11 swap and again after adding its pull-up resistor, see Revision history below).

## Findings

One real issue caught and fixed during development, not present in this
final run:

| # | Severity | Message | Root cause | Fix |
|---|---|---|---|---|
| 1 | WARNING (fixed) | `No drivers for net SCL` / `Insufficient drive current on net SCL` (×3) | `mcu_core.py`'s Dev Kit V1 `GPIO22_SCL` pin was initially declared `INPUT` — correct for a plain slave device, but the ESP32 is the I2C *master* here and clock-drives SCL. With no driver-typed pin on the net, ERC flagged every INPUT-typed listener as starved. | Changed to `BIDIR` (matching `SDA`, and the ESP8266 sibling rig's own `D1`/SCL pin), which both reflects clock-stretching's genuinely bidirectional nature and satisfies ERC's driver check. |

## Footprint validation

`✓ All footprints valid (7 checked across 6 files)`.

## Verdict

**PASS.** Ready for the wiring diagram to be used as-is.

## Netlistsvg rendering fixes applied proactively

Two `netlistsvg`/`elkjs` schematic-rendering crash patterns were
discovered and fixed the hard way in the ESP8266 sibling rig's
development history (see
`../../esp8266-tilt-prototype/outputs/erc_report.md`'s revision history
for the full diagnostic story). Both were applied here from the start,
so the schematic SVG/PDF generated clean on the first attempt with no
crash-and-fix cycle needed, both before and after the DHT11 swap below:

- **`mcu_core.py`**: `GPIO25_BATTERY_EN` is genuinely unused on this
  ungated build. Declared `Pin.types.NOCONNECT` directly, rather than a
  functionally-typed pin (`OUTPUT`, etc.) wired only to the `NC` net —
  the latter pattern produces a netlist/port-direction mismatch that
  crashes netlistsvg's ELK-based layout engine. (`GPIO4` was the same
  story before the DHT11 swap; it's now a genuinely-used `BIDIR` pin —
  see Revision history.)
- **`sensor_bus.py`**: `GY-291["CS"]` gets a schematic-render-only
  `symio="output"` hint before being wired to `DEVKIT_3V3`. Without it,
  a single driver pin (the Dev Kit V1's `3V3` output) fanning out to two
  input-typed pins on the *same* part instance (GY-291's `VCC` and `CS`
  both landing on `DEVKIT_3V3`) crashes the same ELK layout engine with
  a `java.lang.ClassCastException`. `symio` only affects the rendered
  schematic's arrow direction, not ERC (which still checks the real
  `func=INPUT`), so this is purely cosmetic/render-side, not an
  electrical change.

This design carries the same `DEVKIT_3V3` fan-out topology as the
ESP8266 rig (one driver, multiple sinks, two of which share a part), so
without these fixes applied up front the same crash would very likely
have reappeared here too.

## Revision history

- **MCP9808 removed, DHT11 added as the primary (and only) temperature
  sensor.** `sensor_bus.py` no longer includes the MCP9808 breakout
  (GY-291/tilt only now); a new `dht11.py` block adds a DHT11 breakout
  (`MOD4`) on its own single-wire pin. `mcu_core.py`'s `GPIO4` pin
  changed from `NOCONNECT` (previously the unused DS18B20 fallback pin)
  to `BIDIR` (the DHT11's genuinely-used data line) — no netlistsvg
  regression, since a real `BIDIR` pin wired to a real 2-endpoint net
  doesn't hit either crash pattern above. Re-verified: ERC still 0
  errors/0 warnings, footprints still 6/6 valid (GY-291 + DHT11 +
  ESP32 Dev Kit V1 + TP4056 + R1 + R2).
- **DHT11 pull-up resistor (`R3`, 10kΩ) added.** A user photo confirmed
  the actual part is a bare 4-pin Asair DHT11 (no onboard pull-up),
  not the 3-pin breakout `dht11.py` originally assumed. Added between
  `DHT_DATA` and `DEVKIT_3V3`. `DEVKIT_3V3` still has the same
  same-part fan-out (GY-291's `VCC`+`CS`) the `symio="output"` fix
  above addresses — `R3` and the DHT11's `VDD` are each single
  endpoints on that net, so no new crash risk. Re-verified: ERC still
  0 errors/0 warnings, footprints 7/7 valid, schematic SVG/PDF
  regenerated clean on the first attempt.
