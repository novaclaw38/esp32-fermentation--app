import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import type { Device } from "../../types/database";

interface Props {
  device: Device;
  onSaved: (updated: Partial<Device>) => void;
}

export default function NotifyEmailToggle({ device, onSaved }: Props) {
  const [error, setError] = useState<string | null>(null);

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
    <div className="rounded-lg border border-panel-700 bg-panel-900 p-4">
      <label className="flex items-start gap-2 text-sm text-panel-200">
        <input
          type="checkbox"
          checked={device.notify_email}
          onChange={(e) => toggleNotifyEmail(e.target.checked)}
          className="mt-0.5 accent-brew-500"
        />
        <span>
          Email me when this device alerts
          <span className="mt-0.5 block text-xs text-panel-400">
            Separate from snoozing under Tools -- this only controls the email, not whether the
            alert shows up on the dashboard.
          </span>
        </span>
      </label>

      {error && <p className="mt-2 text-sm text-breach-400">{error}</p>}
    </div>
  );
}
