import type { Alert } from "../types/database";
import { supabase } from "../lib/supabaseClient";
import { useTempUnit } from "../lib/tempUnitContext";
import { formatTemp } from "../lib/units";

interface Props {
  alerts: Alert[];
  onAcknowledged: (id: number) => void;
}

function reasonLabel(reason: string) {
  if (reason === "below_min") return "Below minimum";
  if (reason === "above_max") return "Above maximum";
  if (reason === "sensor_fault") return "Sensor not reading";
  if (reason === "battery_low") return "Battery low";
  return reason;
}

export default function AlertList({ alerts, onAcknowledged }: Props) {
  const { unit } = useTempUnit();

  async function acknowledge(id: number) {
    const { error } = await supabase.from("alerts").update({ acknowledged: true }).eq("id", id);
    if (!error) onAcknowledged(id);
  }

  if (alerts.length === 0) {
    return <p className="text-sm text-panel-400">No alerts yet — good sign.</p>;
  }

  return (
    <ul className="divide-y divide-panel-700 rounded-lg border border-panel-700 bg-panel-900">
      {alerts.map((alert) => (
        <li key={alert.id} className="flex items-center justify-between gap-4 p-3 text-sm">
          <div>
            <span
              className={
                alert.acknowledged
                  ? "inline-block h-2 w-2 rounded-full bg-panel-600"
                  : "inline-block h-2 w-2 rounded-full bg-breach-400 shadow-[0_0_6px_2px_rgba(248,113,113,0.6)]"
              }
            />
            <span className="ml-2 font-medium text-panel-200">{reasonLabel(alert.reason)}</span>
            {alert.temperature_c !== null && (
              <span className="ml-2 font-gauge tabular text-panel-400">{formatTemp(alert.temperature_c, unit)}</span>
            )}
            <span className="ml-2 text-panel-400">{new Date(alert.created_at).toLocaleString()}</span>
          </div>
          {!alert.acknowledged && (
            <button
              onClick={() => acknowledge(alert.id)}
              className="rounded-md border border-panel-600 px-2 py-1 text-xs font-medium text-panel-200 hover:bg-panel-800"
            >
              Acknowledge
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
