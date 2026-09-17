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
  /** Single-use code printed on the unit. Null once claimed, and on any device the dashboard can see. */
  claim_code: string | null;
  claimed_at: string | null;
  // Gravity calibration: SG = a*tilt^3 + b*tilt^2 + c*tilt + d.
  // All null on a device that hasn't been calibrated yet.
  calibration_a: number | null;
  calibration_b: number | null;
  calibration_c: number | null;
  calibration_d: number | null;
  /**
   * Temperature of the reference solutions when the polynomial above was
   * fitted. The temperature correction is applied relative to THIS, not to an
   * assumed 20C — the polynomial's output is "SG as this device reads at this
   * temperature". Not nullable; defaults to 20 in the database.
   */
  calibration_temp_c: number;
  /**
   * Optional residual SG drift per degree C for device-specific effects the
   * standard liquid correction doesn't model (mainly housing thermal
   * expansion). 0 = unused. Not nullable; defaults to 0.
   */
  temp_coeff_sg_per_c: number;
  /**
   * Optional low-battery alert threshold in volts. NULL = disabled. Leave
   * unset on bench/USB power, where the reading is noise rather than a real
   * cell voltage (0-1.2V observed with nothing attached to the divider).
   */
  battery_min_v: number | null;
  /**
   * While in the future, the device's alerts (including battery_low) are
   * dropped silently rather than inserted -- readings keep posting normally,
   * only alerting pauses. NULL or past = not muted.
   */
  alerts_muted_until: string | null;
  /** Per-device opt-out for the alert-notify email. Not nullable; defaults to true. */
  notify_email: boolean;
  /**
   * Raw tilt + temperature from the reading that started the current batch,
   * auto-captured by ingest_reading() on the first calibrated reading after
   * a claim or an explicit "start new batch" reset. Kept raw rather than a
   * pre-computed SG so recalibrating the device corrects the batch's
   * original gravity right along with the rest of its history -- run it
   * through computeGravitySg() like any other reading, don't read it as SG
   * directly. Both null until a batch has a calibrated reading.
   */
  og_tilt_deg: number | null;
  og_temp_c: number | null;
  /** Set alongside og_tilt_deg/og_temp_c. Anchors the fermentation-rate and plateau-completion windows. */
  fermentation_started_at: string | null;
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
 * Both are null when the device is uncalibrated or the row has no tilt.
 */
export interface ReadingWithGravity extends Reading {
  /** Corrected to a 20C reference. This is the number to show a brewer. */
  gravity_sg: number | null;
  /** Uncorrected polynomial output, so the size of the correction is visible. */
  gravity_sg_raw: number | null;
}

export interface Alert {
  id: number;
  device_id: string;
  /** NULL when the device is reporting that it has no reading to give, e.g. sensor_fault. */
  temperature_c: number | null;
  reason: string;
  created_at: string;
  acknowledged: boolean;
}
