# /// script
# requires-python = ">=3.10"
# dependencies = ["mcp>=1.2,<2", "skidl>=2.0,<3"]
# ///
"""SKiDL MCP server for this repo.

Lets an MCP client (Claude Code etc.) discover the SKiDL circuit packages in
the repo, build them (ERC + netlist + BOM), and query the KiCad symbol
libraries. Registered in .mcp.json; run by hand with:

    uv run --script tools/skidl_mcp.py

Every SKiDL call runs in a fresh subprocess: SKiDL keeps the circuit in
module-level global state, so building two designs in one interpreter would
merge their parts.
"""
from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from pathlib import Path

from mcp.server.fastmcp import FastMCP

REPO = Path(__file__).resolve().parent.parent
TIMEOUT_S = 180
MAX_CHARS = 20000
# SKiDL log chatter that drowns out the useful lines.
NOISE = ("Adding ", "environment variable is missing", "fp-lib-table file was not found")

mcp = FastMCP("skidl")


def _circuits() -> dict[str, Path]:
    """Map circuit package name -> project root (the dir holding circuits/)."""
    found = {}
    for main in sorted(REPO.glob("**/circuits/*/__main__.py")):
        if any(p in (".venv", "node_modules", ".git") for p in main.parts):
            continue
        if "skidl" not in main.read_text(errors="ignore"):
            continue
        found[main.parent.name] = main.parent.parent.parent
    return found


def _env() -> dict[str, str]:
    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    sym = env.get("KICAD_SYMBOL_DIR") or "/usr/share/kicad/symbols"
    for var in ("KICAD7_SYMBOL_DIR", "KICAD8_SYMBOL_DIR", "KICAD_SYMBOL_DIR"):
        env.setdefault(var, sym)
    return env


def _run(args: list[str], cwd: Path) -> str:
    try:
        proc = subprocess.run(
            [sys.executable, *args], cwd=cwd, env=_env(),
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            timeout=TIMEOUT_S,
        )
    except subprocess.TimeoutExpired:
        return f"Timed out after {TIMEOUT_S}s."
    lines = (proc.stdout + proc.stderr).splitlines()
    out = "\n".join(l for l in lines if l.strip() and not any(n in l for n in NOISE))
    if len(out) > MAX_CHARS:
        out = "...(truncated)\n" + out[-MAX_CHARS:]
    sym = _env()["KICAD7_SYMBOL_DIR"]
    if proc.returncode and not Path(sym).is_dir():
        out += (f"\n\nHint: KiCad symbol dir {sym} does not exist. Install KiCad "
                "or set KICAD_SYMBOL_DIR to a kicad-symbols checkout.")
    return f"exit code {proc.returncode}\n\n{out or '(no output)'}"


def _py(code: str) -> str:
    # Library queries run in a scratch dir: SKiDL searches the cwd for
    # libraries and would pick up a build's *_sklib.py cache.
    with tempfile.TemporaryDirectory() as tmp:
        return _run(["-c", "from skidl import *\n" + code], Path(tmp))


@mcp.tool()
def list_circuits() -> str:
    """List the SKiDL circuit packages in the repo and their project roots."""
    circuits = _circuits()
    if not circuits:
        return "No SKiDL circuit packages found."
    return "\n".join(
        f"{name}  (project: {root.relative_to(REPO) if root != REPO else '.'})"
        for name, root in circuits.items()
    )


@mcp.tool()
def build_circuit(name: str) -> str:
    """Build a circuit package: runs its __main__ (ERC, netlist, BOM XML).

    Returns the SKiDL log (ERC warnings/errors included) and the output files
    written. `name` is a package name from list_circuits.
    """
    circuits = _circuits()
    if name not in circuits:
        return f"Unknown circuit {name!r}. Known: {', '.join(circuits) or 'none'}"
    root = circuits[name]
    outputs = root / "outputs"
    before = {p: p.stat().st_mtime for p in outputs.glob("*")} if outputs.is_dir() else {}
    log = _run(["-m", f"circuits.{name}"], root)
    written = [
        str(p.relative_to(REPO)) for p in sorted(outputs.glob("*"))
        if p.is_file() and before.get(p) != p.stat().st_mtime
    ] if outputs.is_dir() else []
    return f"{log}\n\nFiles written: {', '.join(written) or 'none'}"


@mcp.tool()
def list_circuit_files(name: str) -> str:
    """List the SKiDL block source files of a circuit package."""
    circuits = _circuits()
    if name not in circuits:
        return f"Unknown circuit {name!r}. Known: {', '.join(circuits) or 'none'}"
    pkg = circuits[name] / "circuits" / name
    return "\n".join(str(p.relative_to(REPO)) for p in sorted(pkg.glob("*.py")))


@mcp.tool()
def search_parts(query: str) -> str:
    """Search the KiCad symbol libraries for parts matching `query`
    (space-separated terms are ANDed, e.g. "lipo charger")."""
    return _py(f"set_default_tool(KICAD7)\nsearch({query!r})")


@mcp.tool()
def show_part(lib: str, name: str) -> str:
    """Show a part's pins, e.g. lib="Sensor_Temperature", name="MCP9808_MSOP"."""
    return _py(f"set_default_tool(KICAD7)\nprint(show({lib!r}, {name!r}))")


if __name__ == "__main__":
    mcp.run()
