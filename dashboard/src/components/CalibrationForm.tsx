import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabaseClient";
import type { Device } from "../types/database";

interface Props {
  device: Device;
  onSaved: (updated: Partial<Device>) => void;
}

type Coefficient = "calibration_a" | "calibration_b" | "calibration_c" | "calibration_d";

const COEFFICIENTS: { key: Coefficient; label: string; hint: string }[] = [
  { key: "calibration_a", label: "a (tilt³)", hint: "0 for a linear or quadratic fit" },
  { key: "calibration_b", label: "b (tilt²)", hint: "0 for a linear fit" },
  { key: "calibration_c", label: "c (tilt)", hint: "required" },
  { key: "calibration_d", label: "d (constant)", hint: "usually near 1.0" },
];

function initial(device: Device): Record<Coefficient, string> {
  return {
    calibration_a: device.calibration_a?.toString() ?? "",
    calibration_b: device.calibration_b?.toString() ?? "",
    calibration_c: device.calibration_c?.toString() ?? "",
    calibration_d: device.calibration_d?.toString() ?? "",
  };
}

export default function CalibrationForm({ device, onSaved }: Props) {
  const [values, setValues] = useState(() => initial(device));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function set(key: Coefficient, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    // An empty box means "this term is unused", which is a real 0 in the
    // polynomial -- except for c, where empty means "not calibrated at all"
    // and has to stay null so the view keeps reporting no gravity.
    const updates: Partial<Device> = {};
    for (const { key } of COEFFICIENTS) {
      const raw = values[key].trim();
      if (raw === "") {
        updates[key] = null;
        continue;
      }
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) {
        setError(`"${raw}" isn't a number.`);
        return;
      }
      updates[key] = parsed;
    }

    if (updates.calibration_c == null && (updates.calibration_a != null || updates.calibration_b != null || updates.calibration_d != null)) {
      setError("c is required — without it the device stays uncalibrated and no gravity is computed.");
      return;
    }

    setSaving(true);
    const { error: updateError } = await supabase.from("devices").update(updates).eq("id", device.id);
    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    onSaved(updates);
    setSaved(true);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
      <p className="text-sm text-stone-600">
        Specific gravity is derived from the tilt angle by this curve:{" "}
        <code className="rounded bg-stone-100 px-1">SG = a·tilt³ + b·tilt² + c·tilt + d</code>. Fit
        it from a few reference-gravity samples taken with a hydrometer during setup — the
        procedure is in <code>firmware/README.md</code>.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {COEFFICIENTS.map(({ key, label, hint }) => (
          <label key={key} className="text-sm">
            {label}
            <input
              type="text"
              inputMode="decimal"
              value={values[key]}
              onChange={(e) => set(key, e.target.value)}
              placeholder={hint}
              className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1"
            />
            <span className="mt-0.5 block text-xs text-stone-400">{hint}</span>
          </label>
        ))}
      </div>

      <p className="text-xs text-stone-500">
        Gravity is computed when readings are read, not when they're stored — so saving a corrected
        curve here fixes this device's entire history, not just future readings.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && !error && <p className="text-sm text-green-700">Calibration saved.</p>}

      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-brew-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brew-700 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save calibration"}
      </button>
    </form>
  );
}
