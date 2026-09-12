export type DeviceType = "hub" | "tilt" | "co2";

export interface Device {
  id: string;
  user_id: string;
  name: string;
  device_type: DeviceType;
  temp_min_c: number;
  temp_max_c: number;
  consecutive_breach_limit: number;
  sleep_interval_seconds: number;
  last_seen_at: string | null;
  created_at: string;
  // Gravity calibration: SG = a*tilt^3 + b*tilt^2 + c*tilt + d.
  // All null on a device that hasn't been calibrated yet.
  calibration_a: number | null;
  calibration_b: number | null;
  calibration_c: number | null;
  calibration_d: number | null;
}

export interface Reading {
  id: number;
  device_id: string;
  temperature_c: number;
  battery_v: number | null;
  /** Raw tilt angle in degrees from vertical. Null on Hub devices. */
  tilt_deg: number | null;
  created_at: string;
}

/**
 * A row from the `readings_with_gravity` view: everything in `readings` plus
 * the specific gravity Postgres derived from the device's calibration curve.
 * `gravity_sg` is null when the device is uncalibrated or the row has no tilt.
 */
export interface ReadingWithGravity extends Reading {
  gravity_sg: number | null;
}

export interface Alert {
  id: number;
  device_id: string;
  temperature_c: number;
  reason: string;
  created_at: string;
  acknowledged: boolean;
}
