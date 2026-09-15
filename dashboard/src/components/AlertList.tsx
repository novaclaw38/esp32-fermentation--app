import type { Alert } from "../types/database";
import { supabase } from "../lib/supabaseClient";

interface Props {
  alerts: Alert[];
  onAcknowledged: (id: number) => void;
}

function reasonLabel(reason: string) {
  if (reason === "below_min") return "Below minimum";
  if (reason === "above_max") return "Above maximum";
  if (reason === "sensor_fault") return "Sensor not reading";
  return reason;
}

export default function AlertList({ alerts, onAcknowledged }: Props) {
  async function acknowledge(id: number) {
    const { error } = await supabase.from("alerts").update({ acknowledged: true }).eq("id", id);
    if (!error) onAcknowledged(id);
  }

  if (alerts.length === 0) {
    return <p className="text-sm text-stone-500">No alerts yet — good sign.</p>;
  }

  return (
    <ul className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
      {alerts.map((alert) => (
        <li key={alert.id} className="flex items-center justify-between gap-4 p-3 text-sm">
          <div>
            <span
              className={
                alert.acknowledged
                  ? "inline-block h-2 w-2 rounded-full bg-stone-300"
                  : "inline-block h-2 w-2 rounded-full bg-red-500"
              }
            />
            <span className="ml-2 font-medium">{reasonLabel(alert.reason)}</span>
            {alert.temperature_c !== null && (
              <span className="ml-2 text-stone-500">{alert.temperature_c.toFixed(1)}°C</span>
            )}
            <span className="ml-2 text-stone-400">{new Date(alert.created_at).toLocaleString()}</span>
          </div>
          {!alert.acknowledged && (
            <button
              onClick={() => acknowledge(alert.id)}
              className="rounded-md border border-stone-300 px-2 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100"
            >
              Acknowledge
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
