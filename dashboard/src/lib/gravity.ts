import type { Device } from "../types/database";

/**
 * Client-side mirror of the `readings_with_gravity` view's SQL expression
 * (see supabase/migrations/20260912100000_tilt_gravity_support.sql):
 *
 *   SG = a*tilt^3 + b*tilt^2 + c*tilt + d
 *
 * Reads normally arrive from the view with `gravity_sg` already computed by
 * Postgres. This exists for the Realtime path only: `postgres_changes`
 * subscribes to the `readings` *table*, and a view can't emit replication
 * events, so a live row shows up as raw `tilt_deg` with no gravity attached.
 * Without this, a new reading would blank out the chart's last point until
 * the next full page load.
 *
 * Keep this in step with the view. If the polynomial changes there, change
 * it here too, or live readings will disagree with reloaded ones.
 */
export function computeGravitySg(device: Device, tiltDeg: number | null): number | null {
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
 * `calibration_c` is the linear term — the one coefficient a fit of any order
 * (linear, quadratic, cubic) must produce. The view treats it as the marker
 * for "this device has been calibrated", so the UI uses the same test.
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
