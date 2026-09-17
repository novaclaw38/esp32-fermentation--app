import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import type { Device } from "../../types/database";
import { computeGravitySg, formatSg } from "../../lib/gravity";

interface Props {
  device: Device;
  onSaved: (updated: Partial<Device>) => void;
}

export default function BatchForm({ device, onSaved }: Props) {
  // Two-step, same reasoning as unclaim/remove: this throws away the batch's
  // OG anchor and every derived ABV/attenuation/stage figure resets to
  // "waiting for a reading" until the next calibrated one posts.
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const og = device.og_tilt_deg != null ? computeGravitySg(device, device.og_tilt_deg, device.og_temp_c) : null;

  async function handleReset() {
    setResetting(true);
    setError(null);

    const updates: Partial<Device> = { og_tilt_deg: null, og_temp_c: null, fermentation_started_at: null };
    const { error: updateError } = await supabase.from("devices").update(updates).eq("id", device.id);
    setResetting(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    onSaved(updates);
    setConfirming(false);
  }

  return (
    <div className="rounded-lg border border-panel-700 bg-panel-900 p-4">
      <p className="text-sm font-medium text-panel-200">Batch</p>
      <p className="mt-1 text-xs text-panel-400">
        Original gravity is captured automatically from the first calibrated reading after this
        device is claimed, and every ABV/attenuation/stage figure is measured against it until you
        reset it here. Reset when you rack the same unit into a new batch — not needed between
        readings of the same fermentation.
      </p>

      {og != null && device.fermentation_started_at ? (
        <p className="mt-2 text-sm text-panel-200">
          Current batch: OG {formatSg(og)}, started {new Date(device.fermentation_started_at).toLocaleString()}
        </p>
      ) : (
        <p className="mt-2 text-sm text-panel-400">
          No batch in progress — OG will be captured from the next calibrated reading.
        </p>
      )}

      {error && <p className="mt-2 text-sm text-breach-400">{error}</p>}

      {og == null ? null : !confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="mt-3 rounded-md border border-panel-600 px-3 py-1.5 text-sm font-medium text-panel-200 hover:bg-panel-800"
        >
          Start new batch…
        </button>
      ) : (
        <div className="mt-3 flex gap-2">
          <button
            onClick={handleReset}
            disabled={resetting}
            className="rounded-md bg-breach-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-breach-400 disabled:opacity-40"
          >
            {resetting ? "Resetting…" : "Yes, start a new batch"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="rounded-md border border-panel-600 px-3 py-1.5 text-sm text-panel-200 hover:bg-panel-800"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
