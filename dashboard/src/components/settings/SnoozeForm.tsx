import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import type { Device } from "../../types/database";

interface Props {
  device: Device;
  onSaved: (updated: Partial<Device>) => void;
}

const SNOOZE_OPTIONS: { label: string; hours: number }[] = [
  { label: "1 hour", hours: 1 },
  { label: "6 hours", hours: 6 },
  { label: "24 hours", hours: 24 },
  { label: "7 days", hours: 24 * 7 },
];

export default function SnoozeForm({ device, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutedUntil = device.alerts_muted_until ? new Date(device.alerts_muted_until) : null;
  const isMuted = mutedUntil !== null && mutedUntil.getTime() > Date.now();

  async function applyMute(hours: number | null) {
    setSaving(true);
    setError(null);

    const alerts_muted_until = hours == null ? null : new Date(Date.now() + hours * 3600_000).toISOString();
    const { error: updateError } = await supabase
      .from("devices")
      .update({ alerts_muted_until })
      .eq("id", device.id);

    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onSaved({ alerts_muted_until });
  }

  return (
    <div className="rounded-lg border border-panel-700 bg-panel-900 p-4">
      <p className="text-sm font-medium text-panel-200">Snooze alerts</p>
      <p className="mt-1 text-xs text-panel-400">
        Readings keep posting and charting normally -- only new temperature and battery alerts
        are held back. Useful during a cold crash or any deliberate swing you don't want to be
        paged for.
      </p>

      {isMuted && mutedUntil && (
        <p className="mt-2 rounded-md border border-approach-500/40 bg-panel-950 px-2 py-1 text-sm text-approach-400">
          Muted until {mutedUntil.toLocaleString()}
        </p>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        {SNOOZE_OPTIONS.map(({ label, hours }) => (
          <button
            key={label}
            onClick={() => applyMute(hours)}
            disabled={saving}
            className="rounded-md border border-panel-600 px-2.5 py-1 text-xs font-medium text-panel-200 hover:bg-panel-800 disabled:opacity-50"
          >
            {label}
          </button>
        ))}
        {isMuted && (
          <button
            onClick={() => applyMute(null)}
            disabled={saving}
            className="rounded-md border border-brew-600 bg-panel-800 px-2.5 py-1 text-xs font-medium text-brew-400 hover:bg-panel-700 disabled:opacity-50"
          >
            Unmute now
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-breach-400">{error}</p>}
    </div>
  );
}
