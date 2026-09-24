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
  const [calTemp, setCalTemp] = useState(String(device.calibration_temp_c ?? 20));
  const [tempCoeff, setTempCoeff] = useState(String(device.temp_coeff_sg_per_c ?? 0));
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

    // The temperature correction is applied relative to this value, so a wrong
    // one biases every reading rather than failing visibly.
    const parsedCalTemp = Number(calTemp.trim());
    if (calTemp.trim() === "" || !Number.isFinite(parsedCalTemp)) {
      setError("Calibration temperature is required — the correction is measured from it.");
      return;
    }
    if (parsedCalTemp < -10 || parsedCalTemp > 50) {
      setError("Calibration temperature must be between −10°C and 50°C.");
      return;
    }
    updates.calibration_temp_c = parsedCalTemp;

    const parsedCoeff = tempCoeff.trim() === "" ? 0 : Number(tempCoeff.trim());
    if (!Number.isFinite(parsedCoeff)) {
      setError(`"${tempCoeff}" isn't a number.`);
      return;
    }
    updates.temp_coeff_sg_per_c = parsedCoeff;

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
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-panel-700 bg-panel-900 p-4">
      <p className="text-sm text-panel-400">
        Specific gravity is derived from the tilt angle by this curve:{" "}
        <code className="rounded bg-panel-800 px-1">SG = a·tilt³ + b·tilt² + c·tilt + d</code>. Fit
        it from a few reference-gravity samples taken with a hydrometer during setup — the
        procedure is in <code>firmware/README.md</code>.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {COEFFICIENTS.map(({ key, label, hint }) => (
          <label key={key} className="text-sm text-panel-200">
            {label}
            <input
              type="text"
              inputMode="decimal"
              value={values[key]}
              onChange={(e) => set(key, e.target.value)}
              placeholder={hint}
              className="mt-1 w-full rounded-md border border-panel-600 bg-panel-950 px-2 py-2 text-panel-200"
            />
            <span className="mt-0.5 block text-xs text-panel-400">{hint}</span>
          </label>
        ))}
      </div>

      <div className="rounded-md border border-panel-700 bg-panel-950 p-3">
        <p className="text-sm font-medium text-panel-200">Temperature correction</p>
        <p className="mt-1 text-xs text-panel-400">
          Readings are corrected to a 20°C reference using the standard hydrometer curve. The
          correction is measured <em>from the temperature you calibrated at</em>, not from an
          assumed 20°C — so this field has to be right, or every reading is quietly biased. Across
          5–35°C the correction is worth roughly −1.9 to +4.3 gravity points.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm text-panel-200">
            Calibration temperature (°C)
            <input
              type="number"
              step="0.1"
              required
              value={calTemp}
              onChange={(e) => {
                setCalTemp(e.target.value);
                setSaved(false);
              }}
              className="mt-1 w-full rounded-md border border-panel-600 bg-panel-950 px-2 py-2 text-panel-200"
            />
            <span className="mt-0.5 block text-xs text-panel-400">
              What the reference solutions were at
            </span>
          </label>
          <label className="text-sm text-panel-200">
            Residual drift (SG per °C)
            <input
              type="text"
              inputMode="decimal"
              value={tempCoeff}
              onChange={(e) => {
                setTempCoeff(e.target.value);
                setSaved(false);
              }}
              placeholder="0"
              className="mt-1 w-full rounded-md border border-panel-600 bg-panel-950 px-2 py-2 text-panel-200"
            />
            <span className="mt-0.5 block text-xs text-panel-400">
              Optional. Leave 0 unless you calibrated at two temperatures
            </span>
          </label>
        </div>
      </div>

      <p className="text-xs text-panel-400">
        Gravity is computed when readings are read, not when they're stored — so saving a corrected
        curve here fixes this device's entire history, not just future readings.
      </p>

      {error && (
            <p role="alert" className="text-sm text-breach-400">
              {error}
            </p>
          )}
      {saved && !error && <p className="text-sm text-brew-400">Calibration saved.</p>}

      <button
        type="submit"
        disabled={saving}
        className="min-h-11 rounded-md bg-brew-600 px-3 py-2 text-sm font-medium text-white hover:bg-brew-700 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save calibration"}
      </button>
    </form>
  );
}
