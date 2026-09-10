import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabaseClient";
import type { Device } from "../types/database";

interface Props {
  device: Device;
  onSaved: (updated: Partial<Device>) => void;
}

export default function ThresholdForm({ device, onSaved }: Props) {
  const [tempMinC, setTempMinC] = useState(String(device.temp_min_c));
  const [tempMaxC, setTempMaxC] = useState(String(device.temp_max_c));
  const [breachLimit, setBreachLimit] = useState(String(device.consecutive_breach_limit));
  const [sleepSeconds, setSleepSeconds] = useState(String(device.sleep_interval_seconds));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const updates = {
      temp_min_c: Number(tempMinC),
      temp_max_c: Number(tempMaxC),
      consecutive_breach_limit: Number(breachLimit),
      sleep_interval_seconds: Number(sleepSeconds),
    };

    if (updates.temp_min_c >= updates.temp_max_c) {
      setError("Minimum must be lower than maximum.");
      setSaving(false);
      return;
    }

    const { error: updateError } = await supabase.from("devices").update(updates).eq("id", device.id);

    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onSaved(updates);
    setSavedAt(Date.now());
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          Min °C
          <input
            type="number"
            step="0.1"
            value={tempMinC}
            onChange={(e) => setTempMinC(e.target.value)}
            className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1"
          />
        </label>
        <label className="text-sm">
          Max °C
          <input
            type="number"
            step="0.1"
            value={tempMaxC}
            onChange={(e) => setTempMaxC(e.target.value)}
            className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1"
          />
        </label>
        <label className="text-sm">
          Consecutive breaches before alert
          <input
            type="number"
            min="1"
            value={breachLimit}
            onChange={(e) => setBreachLimit(e.target.value)}
            className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1"
          />
        </label>
        <label className="text-sm">
          Sleep interval (seconds)
          <input
            type="number"
            min="60"
            value={sleepSeconds}
            onChange={(e) => setSleepSeconds(e.target.value)}
            className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1"
          />
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {savedAt && !error && <p className="text-sm text-green-700">Saved — the device will pick this up on its next wake cycle.</p>}

      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-brew-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brew-700 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save thresholds"}
      </button>
    </form>
  );
}
