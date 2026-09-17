import { useTempUnit } from "../lib/tempUnitContext";

/** A compact °C/°F switch. Toggling anywhere updates every page, via context. */
export default function UnitToggle() {
  const { unit, toggle } = useTempUnit();

  return (
    <button
      onClick={toggle}
      title="Display temperatures in °C or °F (readings are always stored in °C)"
      className="rounded-md border border-stone-300 px-2 py-1 text-xs font-medium text-stone-600 hover:bg-stone-100"
    >
      °{unit === "C" ? "C" : "F"} <span className="text-stone-400">→ °{unit === "C" ? "F" : "C"}</span>
    </button>
  );
}
