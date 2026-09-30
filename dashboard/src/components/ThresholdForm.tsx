import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabaseClient";
import type { Device } from "../types/database";

interface Props {
  device: Device;
  onSaved: (updated: Partial<Device>) => void;
}

/** Null for blank or non-numeric input -- never silently 0. */
function parseField(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export default function ThresholdForm({ device, onSaved }: Props) {
  const [tempMinC, setTempMinC] = useState(String(device.temp_min_c));
  const [tempMaxC, setTempMaxC] = useState(String(device.temp_max_c));
  const [breachLimit, setBreachLimit] = useState(String(device.consecutive_breach_limit));
  const [sleepSeconds, setSleepSeconds] = useState(String(device.sleep_interval_seconds));
  const [batteryMinV, setBatteryMinV] = useState(device.battery_min_v != null ? String(device.battery_min_v) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    // Number("") is 0, not "missing": a cleared field used to save as 0,
    // and a 0 sleep interval put the device into a continuous wake loop.
    // Every field is parsed explicitly and rejected if blank or out of range.
    // (The database enforces the same ranges; this just says why up front.)
    const parsed = {
      temp_min_c: parseField(tempMinC),
      temp_max_c: parseField(tempMaxC),
      consecutive_breach_limit: parseField(breachLimit),
      sleep_interval_seconds: parseField(sleepSeconds),
    };
    const problem =
      parsed.temp_min_c == null || parsed.temp_max_c == null
        ? "Enter both a minimum and a maximum temperature."
        : parsed.temp_min_c >= parsed.temp_max_c
          ? "Minimum must be lower than maximum."
          : parsed.temp_min_c < -40 || parsed.temp_max_c > 125
            ? "Temperatures must be between −40°C and 125°C."
            : parsed.consecutive_breach_limit == null ||
                !Number.isInteger(parsed.consecutive_breach_limit) ||
                parsed.consecutive_breach_limit < 1 ||
                parsed.consecutive_breach_limit > 100
              ? "Consecutive breaches must be a whole number from 1 to 100."
              : parsed.sleep_interval_seconds == null ||
                  !Number.isInteger(parsed.sleep_interval_seconds) ||
                  parsed.sleep_interval_seconds < 60 ||
                  parsed.sleep_interval_seconds > 86400
                ? "Sleep interval must be a whole number of seconds from 60 to 86400 (24 hours)."
                : null;
    if (problem) {
      setError(problem);
      setSaving(false);
      return;
    }

    const updates: Partial<Device> = {
      temp_min_c: parsed.temp_min_c!,
      temp_max_c: parsed.temp_max_c!,
      consecutive_breach_limit: parsed.consecutive_breach_limit!,
      sleep_interval_seconds: parsed.sleep_interval_seconds!,
    };

    // Blank means "disabled" -- leave it unset on bench/USB power, where the
    // reading is divider noise rather than a real cell voltage.
    const trimmedBattery = batteryMinV.trim();
    if (trimmedBattery === "") {
      updates.battery_min_v = null;
    } else {
      const parsed = Number(trimmedBattery);
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 5) {
        setError("Battery threshold must be a voltage between 0 and 5.");
        setSaving(false);
        return;
      }
      updates.battery_min_v = parsed;
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
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-panel-700 bg-panel-900 p-4">
      <p className="text-xs text-panel-400">
        Thresholds are entered in °C whatever the display unit, so a saved value never drifts
        through a round-trip conversion.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-sm text-panel-200">
          Min °C
          <input
            type="number"
            step="0.1"
            value={tempMinC}
            onChange={(e) => setTempMinC(e.target.value)}
            className="mt-1 w-full rounded-md border border-panel-600 bg-panel-950 min-h-11 px-2 py-2 font-gauge tabular text-panel-200"
          />
        </label>
        <label className="text-sm text-panel-200">
          Max °C
          <input
            type="number"
            step="0.1"
            value={tempMaxC}
            onChange={(e) => setTempMaxC(e.target.value)}
            className="mt-1 w-full rounded-md border border-panel-600 bg-panel-950 min-h-11 px-2 py-2 font-gauge tabular text-panel-200"
          />
        </label>
        <label className="text-sm text-panel-200">
          Consecutive breaches before alert
          <input
            type="number"
            min="1"
            max="100"
            step="1"
            value={breachLimit}
            onChange={(e) => setBreachLimit(e.target.value)}
            className="mt-1 w-full rounded-md border border-panel-600 bg-panel-950 min-h-11 px-2 py-2 font-gauge tabular text-panel-200"
          />
        </label>
        <label className="text-sm text-panel-200">
          Sleep interval (seconds)
          <input
            type="number"
            min="60"
            max="86400"
            step="1"
            value={sleepSeconds}
            onChange={(e) => setSleepSeconds(e.target.value)}
            className="mt-1 w-full rounded-md border border-panel-600 bg-panel-950 min-h-11 px-2 py-2 font-gauge tabular text-panel-200"
          />
        </label>
        <label className="text-sm text-panel-200 sm:col-span-2">
          Low-battery alert (volts)
          <input
            type="number"
            step="0.1"
            placeholder="disabled"
            value={batteryMinV}
            onChange={(e) => setBatteryMinV(e.target.value)}
            className="mt-1 block w-full rounded-md border border-panel-600 bg-panel-950 min-h-11 px-2 py-2 font-gauge tabular text-panel-200 sm:w-1/2"
          />
          <span className="mt-0.5 block text-xs text-panel-400">
            Leave blank to disable. Leave blank on bench/USB power too: with no cell attached the
            reading is noise (0–1.2V observed), not a real voltage.
          </span>
        </label>
      </div>

      <div aria-live="polite">
        {error && (
          <p role="alert" className="text-sm text-breach-400">
            {error}
          </p>
        )}
        {savedAt && !error && <p className="text-sm text-brew-400">Saved — the device will pick this up on its next wake cycle.</p>}
      </div>

      <button
        type="submit"
        disabled={saving}
        className="min-h-11 rounded-md bg-brew-600 px-3 py-2 text-sm font-medium text-white hover:bg-brew-700 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save thresholds"}
      </button>
    </form>
  );
}
