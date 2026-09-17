import { useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabaseClient";
import type { Device } from "../../types/database";

interface Props {
  device: Device;
  onSaved: (updated: Partial<Device>) => void;
}

const TYPE_LABEL: Record<Device["device_type"], string> = {
  hub: "Hub (temperature only)",
  tilt: "Temp + Gravity",
  co2: "CO₂",
};

export default function DeviceProfileForm({ device, onSaved }: Props) {
  const [name, setName] = useState(device.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name can't be empty.");
      return;
    }

    setSaving(true);
    const { error: updateError } = await supabase
      .from("devices")
      .update({ name: trimmed })
      .eq("id", device.id);
    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    onSaved({ name: trimmed });
    setSaved(true);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-panel-700 bg-panel-900 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-sm text-panel-200">
          Name
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
            className="mt-1 w-full rounded-md border border-panel-600 bg-panel-950 px-2 py-1 text-panel-200"
          />
        </label>
        <label className="text-sm text-panel-400">
          Device ID
          <input
            value={device.id}
            disabled
            className="mt-1 w-full cursor-not-allowed rounded-md border border-panel-700 bg-panel-950 px-2 py-1 text-panel-400"
          />
        </label>
      </div>
      <p className="text-xs text-panel-400">
        {TYPE_LABEL[device.device_type]} · claimed{" "}
        {device.claimed_at ? new Date(device.claimed_at).toLocaleDateString() : new Date(device.created_at).toLocaleDateString()}
      </p>

      {error && <p className="text-sm text-breach-400">{error}</p>}
      {saved && !error && <p className="text-sm text-brew-400">Saved.</p>}

      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-brew-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brew-500 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save name"}
      </button>
    </form>
  );
}
