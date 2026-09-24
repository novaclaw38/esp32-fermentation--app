import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import type { Device } from "../../types/database";

interface Props {
  device: Device;
  onSaved: (updated: Partial<Device>) => void;
}

export default function NotifyEmailToggle({ device, onSaved }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function toggleNotifyEmail(next: boolean) {
    setError(null);
    setSaving(true);
    const { error: updateError } = await supabase
      .from("devices")
      .update({ notify_email: next })
      .eq("id", device.id);
    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    onSaved({ notify_email: next });
  }

  return (
    <div className="rounded-lg border border-panel-700 bg-panel-900 p-4">
      <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-panel-200">
        <input
          type="checkbox"
          checked={device.notify_email}
          disabled={saving}
          onChange={(e) => toggleNotifyEmail(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-brew-500"
        />
        <span>
          Email me when this device alerts
          <span className="mt-0.5 block text-xs text-panel-400">
            Separate from snoozing under Tools: this only controls the email, not whether the
            alert shows up on the dashboard.
          </span>
        </span>
      </label>

      {error && (
        <p role="alert" className="mt-2 text-sm text-breach-400">
          {error}
        </p>
      )}
    </div>
  );
}
