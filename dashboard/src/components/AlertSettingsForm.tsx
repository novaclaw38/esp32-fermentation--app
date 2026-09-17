import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { Device } from "../types/database";

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

export default function AlertSettingsForm({ device, onSaved }: Props) {
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

  async function toggleNotifyEmail(next: boolean) {
    setError(null);
    const { error: updateError } = await supabase
      .from("devices")
      .update({ notify_email: next })
      .eq("id", device.id);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    onSaved({ notify_email: next });
  }

  return (
    <div className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
      <div>
        <p className="text-sm font-medium text-stone-800">Snooze alerts</p>
        <p className="mt-1 text-xs text-stone-600">
          Readings keep posting and charting normally -- only new temperature and battery alerts
          are held back. Useful during a cold crash or any deliberate swing you don't want to be
          paged for.
        </p>

        {isMuted && mutedUntil && (
          <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-sm text-amber-800">
            Muted until {mutedUntil.toLocaleString()}
          </p>
        )}

        <div className="mt-2 flex flex-wrap gap-2">
          {SNOOZE_OPTIONS.map(({ label, hours }) => (
            <button
              key={label}
              onClick={() => applyMute(hours)}
              disabled={saving}
              className="rounded-md border border-stone-300 px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50"
            >
              {label}
            </button>
          ))}
          {isMuted && (
            <button
              onClick={() => applyMute(null)}
              disabled={saving}
              className="rounded-md border border-brew-300 bg-brew-50 px-2.5 py-1 text-xs font-medium text-brew-700 hover:bg-brew-100 disabled:opacity-50"
            >
              Unmute now
            </button>
          )}
        </div>
      </div>

      <label className="flex items-start gap-2 border-t border-stone-100 pt-3 text-sm">
        <input
          type="checkbox"
          checked={device.notify_email}
          onChange={(e) => toggleNotifyEmail(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          Email me when this device alerts
          <span className="mt-0.5 block text-xs text-stone-500">
            Separate from snoozing above -- this only controls the email, not whether the alert
            shows up on this page.
          </span>
        </span>
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
