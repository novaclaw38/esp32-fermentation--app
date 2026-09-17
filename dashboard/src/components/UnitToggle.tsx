import { useTempUnit } from "../lib/tempUnitContext";

/** A compact °C/°F switch. Toggling anywhere updates every page, via context. */
export default function UnitToggle() {
  const { unit, toggle } = useTempUnit();

  return (
    <button
      onClick={toggle}
      title="Display temperatures in °C or °F (readings are always stored in °C)"
      className="rounded-md border border-panel-600 px-2 py-1 text-xs font-medium text-panel-200 hover:bg-panel-800"
    >
      °{unit === "C" ? "C" : "F"} <span className="text-panel-400">→ °{unit === "C" ? "F" : "C"}</span>
    </button>
  );
}
