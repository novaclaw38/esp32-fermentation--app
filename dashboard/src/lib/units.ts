// Display-only unit conversion. Every value in the database, every RPC
// argument, and every input field (thresholds, calibration) stays in °C --
// only what's rendered to a reader changes. That split matters: converting
// an editable field on save would mean converting it back to store it,
// which is exactly the kind of round-trip that quietly drifts a value by a
// rounding error every time someone opens the form. Read-only text has no
// such risk.

export type TempUnit = "C" | "F";

const STORAGE_KEY = "ferm-temp-unit";

export function loadTempUnit(): TempUnit {
  try {
    return localStorage.getItem(STORAGE_KEY) === "F" ? "F" : "C";
  } catch {
    return "C"; // private browsing / blocked storage -- default rather than throw
  }
}

export function saveTempUnit(unit: TempUnit): void {
  try {
    localStorage.setItem(STORAGE_KEY, unit);
  } catch {
    // per-viewer convenience only -- losing it just means it doesn't persist
  }
}

export function celsiusToUnit(c: number, unit: TempUnit): number {
  return unit === "F" ? (c * 9) / 5 + 32 : c;
}

/** "24.0°C" / "75.2°F". Returns "—" for null so callers don't each repeat that check. */
export function formatTemp(c: number | null | undefined, unit: TempUnit, digits = 1): string {
  if (c == null) return "—";
  return `${celsiusToUnit(c, unit).toFixed(digits)}°${unit}`;
}
