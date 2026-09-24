# Factory provisioning

`provision.mjs` mints units: it calls `provision_device()` once per device with
the **service_role** key and writes everything a build session needs.

```bash
SUPABASE_URL=https://<project>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service_role key> \
  node tools/provision.mjs --count 20 --type tilt
```

Add `--dry-run` to exercise the whole output pipeline without touching the
database — worth doing once before a real batch.

## What you get

```
provisioning/batch-<timestamp>/
  manifest.csv        master record — CONTAINS DEVICE SECRETS
  firmware/<id>.txt   the CONFIG lines to paste before flashing that unit
  labels.html         printable claim codes, 3-up on A4, cut lines included
```

| File | Contains secrets? | Handling |
|---|---|---|
| `manifest.csv` | **Yes** | Never commit, never put on a shared drive. This is the only copy — the database stores the secret but won't show it to you again through any client-facing path |
| `firmware/*.txt` | **Yes** | Paste and flash; these are per-unit |
| `labels.html` | No | Safe to print and hand around |

`provisioning/` is in `.gitignore` and should stay there.

## The build loop, per unit

1. Open `firmware/<device-id>.txt`, paste the two `const char*` lines into the
   sketch's CONFIG section, flash.
2. Print `labels.html`, cut, stick the matching claim code on that unit.
3. Ship. The customer joins its setup portal for WiFi, then types the claim
   code into the dashboard to take ownership.

**WiFi is deliberately not in the firmware snippet.** The unit asks its owner
for that through the setup portal — see `firmware/README.md`.

## Guards

- **The key's role is checked before any writes.** A service_role key and an
  anon key look identical at a glance, and pasting the anon one would
  otherwise fail partway through a batch with some units already created. The
  script decodes the JWT and refuses up front.
- **`--count` is capped at 500** and the type must be `hub`, `tilt` or `co2`.
- **A mid-batch failure still writes the output** for units already
  provisioned, and says so loudly. Those rows are real and in the database;
  re-running blindly would provision duplicates.

## Status

The output pipeline is exercised (`--dry-run`, six units, labels rendered and
checked for secret leakage). **The live REST call has not been run** — it needs
the service_role key, which isn't in this repo. The underlying
`provision_device()` RPC itself is verified against the live project; see
`supabase/README.md`.

# SKiDL MCP server

`skidl_mcp.py` is an MCP server (registered as `skidl` in `.mcp.json`) that
lets Claude Code work with the SKiDL circuits in this repo:

| Tool | Does |
|---|---|
| `list_circuits` | Finds every `circuits/<pkg>/__main__.py` SKiDL design (root, `esp32-devkit-tilt-prototype/`, `esp8266-tilt-prototype/`) |
| `list_circuit_files` | Lists a design's block source files |
| `build_circuit` | Runs the design's `__main__`: ERC + netlist + BOM XML into its `outputs/`, returns the log |
| `search_parts` | Searches the KiCad symbol libraries (`"lipo charger"`) |
| `show_part` | Pin list for one symbol (`lib="Sensor_Temperature"`, `name="MCP9808_MSOP"`) |

Requires [`uv`](https://docs.astral.sh/uv/) (it installs `mcp` + `skidl` from
the script's inline metadata) and KiCad 8+ symbol libraries at
`/usr/share/kicad/symbols` (override with `KICAD_SYMBOL_DIR`, e.g. a checkout
of `gitlab.com/kicad/libraries/kicad-symbols`). KiCad 7 libraries lack
`ESP32-WROOM-32E`. Each call runs SKiDL in a fresh subprocess, because SKiDL
keeps the circuit in global state.

If `search_parts` returns stale or duplicate hits, delete SKiDL's part index
at `~/.local/share/skidl/part_search_kicad7.db`.
