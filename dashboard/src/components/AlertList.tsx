import { useState } from "react";
import type { Alert } from "../types/database";
import { supabase } from "../lib/supabaseClient";
import { useTempUnit } from "../lib/tempUnitContext";
import { formatTemp } from "../lib/units";
import { reasonLabel } from "../lib/alerts";
import { formatDateTime } from "../lib/chartTime";

interface Props {
  alerts: Alert[];
  onAcknowledged: (id: number) => void;
}


export default function AlertList({ alerts, onAcknowledged }: Props) {
  const { unit } = useTempUnit();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [failed, setFailed] = useState<{ id: number; message: string } | null>(null);

  async function acknowledge(id: number) {
    setBusyId(id);
    setFailed(null);
    const { error } = await supabase.from("alerts").update({ acknowledged: true }).eq("id", id);
    setBusyId(null);
    // A failed acknowledge used to do nothing at all, leaving the owner
    // unsure whether it took.
    if (error) {
      setFailed({ id, message: error.message });
      return;
    }
    onAcknowledged(id);
  }

  if (alerts.length === 0) {
    return <p className="text-sm text-panel-400">No alerts yet — good sign.</p>;
  }

  return (
    <ul className="divide-y divide-panel-700 rounded-lg border border-panel-700 bg-panel-900">
      {alerts.map((alert) => (
        <li key={alert.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-3 text-sm">
          <div className="min-w-0">
            <span
              aria-hidden="true"
              className={
                alert.acknowledged
                  ? "inline-block h-2 w-2 rounded-full bg-panel-600 shadow-[0_0_0_0_rgba(248,113,113,0)] transition-[background-color,box-shadow] duration-500"
                  : "inline-block h-2 w-2 rounded-full bg-breach-400 shadow-[0_0_6px_2px_rgba(248,113,113,0.6)] transition-[background-color,box-shadow] duration-500"
              }
            />
            <span className="ml-2 font-medium text-panel-200">{reasonLabel(alert.reason)}</span>
            {!alert.acknowledged && <span className="sr-only"> (open)</span>}
            {alert.temperature_c !== null && (
              <span className="ml-2 font-gauge tabular text-panel-400">{formatTemp(alert.temperature_c, unit)}</span>
            )}
            <span className="ml-2 text-panel-400">{formatDateTime(alert.created_at)}</span>
            {failed?.id === alert.id && (
              <p role="alert" className="mt-1 text-xs text-breach-400">
                Couldn't acknowledge: {failed.message}
              </p>
            )}
          </div>
          {!alert.acknowledged && (
            <button
              onClick={() => acknowledge(alert.id)}
              disabled={busyId === alert.id}
              className="min-h-11 rounded-md border border-panel-600 px-3 text-xs font-medium text-panel-200 hover:bg-panel-800 disabled:opacity-50"
            >
              {busyId === alert.id ? "Acknowledging…" : "Acknowledge"}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
