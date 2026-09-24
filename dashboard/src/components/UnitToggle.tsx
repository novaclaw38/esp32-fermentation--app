import { useTempUnit } from "../lib/tempUnitContext";

/** A compact °C/°F switch. Toggling anywhere updates every page, via context. */
export default function UnitToggle() {
  const { unit, toggle } = useTempUnit();
  const other = unit === "C" ? "F" : "C";

  return (
    <button
      onClick={toggle}
      title="Display temperatures in °C or °F (readings are always stored in °C)"
      aria-label={`Showing °${unit}. Switch to °${other}`}
      className="inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-2 text-xs font-medium text-panel-200 hover:bg-panel-800"
    >
      <span className="rounded-md border border-panel-600 px-2 py-1">
        °{unit} <span className="text-panel-400">→ °{other}</span>
      </span>
    </button>
  );
}
