import type { Device } from "../types/database";

/**
 * Client-side mirror of the `readings_with_gravity` view
 * (supabase/migrations/20260912140000_gravity_temperature_correction.sql).
 *
 * This exists for the Realtime path only: `postgres_changes` subscribes to the
 * `readings` *table*, and a view can't emit replication events, so a live row
 * arrives as raw tilt + temperature with no gravity attached. Without this it
 * would drop out of the chart until the next page load.
 *
 * Keep this in step with the view. If the maths changes there, change it here
 * too, or live readings will silently disagree with reloaded ones.
 */

/**
 * The standard hydrometer temperature-correction curve (Lyons), defined in
 * Fahrenheit. Returns a relative density factor — only the *ratio* of two
 * evaluations means anything, never the absolute value.
 *
 * Accurate over roughly 0–40°C, which covers any fermentation this targets.
 * Deliberately not clamped outside that: flattening the curve would hide the
 * inaccuracy rather than surface it.
 */
export function hydrometerTempFactor(tempC: number): number {
  const t = (tempC * 9) / 5 + 32;
  return (
    1.00130346 - 1.34722124e-4 * t + 2.04052596e-6 * t ** 2 - 2.32820948e-9 * t ** 3
  );
}

/** Raw polynomial output: SG as this device reads at its calibration temperature. */
export function computeGravitySgRaw(device: Device, tiltDeg: number | null): number | null {
  // Same guard as the view: an uncalibrated device reports no gravity rather
  // than a plausible-looking wrong number.
  if (tiltDeg == null || device.calibration_c == null) return null;

  return (
    (device.calibration_a ?? 0) * tiltDeg ** 3 +
    (device.calibration_b ?? 0) * tiltDeg ** 2 +
    device.calibration_c * tiltDeg +
    (device.calibration_d ?? 0)
  );
}

/**
 * SG corrected to a 20°C reference — the number to show a brewer.
 *
 * The correction is applied relative to the device's *calibration* temperature,
 * not to an assumed 20°C. The polynomial's output is "SG as this device reads
 * at the temperature its reference solutions were at", so that is the baseline
 * the measurement has to be corrected away from. Getting this wrong biases
 * every reading silently.
 */
export function computeGravitySg(device: Device, tiltDeg: number | null, tempC: number | null): number | null {
  const raw = computeGravitySgRaw(device, tiltDeg);
  if (raw == null) return null;

  // A missing temperature leaves the value uncorrected rather than null: it's
  // still meaningful, just less accurate. In practice the firmware skips the
  // whole cycle when the temperature read fails, so this shouldn't happen.
  if (tempC == null) return raw;

  const calTemp = device.calibration_temp_c ?? 20;
  const liquid = raw * (hydrometerTempFactor(tempC) / hydrometerTempFactor(calTemp));

  // Optional per-device residual (mainly housing thermal expansion), zero
  // unless someone has calibrated at more than one temperature.
  return liquid + (device.temp_coeff_sg_per_c ?? 0) * (tempC - calTemp);
}

/**
 * `calibration_c` is the linear term — the one coefficient a fit of any order
 * must produce. The view treats it as the marker for "this device has been
 * calibrated", so the UI uses the same test.
 */
export function isCalibrated(device: Device): boolean {
  return device.calibration_c != null;
}

export function isTiltDevice(device: Device): boolean {
  return device.device_type === "tilt";
}

/** Brewer-facing SG convention: three decimals, e.g. 1.048. */
export function formatSg(sg: number): string {
  return sg.toFixed(3);
}

/** Gravity "points" — the brewer-native unit for a small SG difference. */
export function formatPoints(deltaSg: number): string {
  return `${deltaSg >= 0 ? "+" : "−"}${Math.abs(deltaSg * 1000).toFixed(1)}`;
}
