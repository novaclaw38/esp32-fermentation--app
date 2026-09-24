import type { Device, ReadingWithGravity } from "../../types/database";

export const HOUR = 60 * 60 * 1000;

export function makeDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: "ferm-test",
    user_id: "u1",
    name: "Test",
    device_type: "tilt",
    temp_min_c: 18,
    temp_max_c: 24,
    consecutive_breach_limit: 3,
    sleep_interval_seconds: 900,
    last_seen_at: null,
    created_at: new Date(0).toISOString(),
    claimed_at: null,
    // Linear curve SG = -0.001 * tilt + 1.1 -- easy to invert in tests.
    calibration_a: 0,
    calibration_b: 0,
    calibration_c: -0.001,
    calibration_d: 1.1,
    calibration_temp_c: 20,
    temp_coeff_sg_per_c: 0,
    battery_min_v: null,
    alerts_muted_until: null,
    notify_email: true,
    og_tilt_deg: null,
    og_temp_c: null,
    fermentation_started_at: null,
    ...overrides,
  };
}

/** Tilt that reads as `sg` on makeDevice()'s curve at the calibration temperature. */
export function tiltFor(sg: number): number {
  return (1.1 - sg) / 0.001;
}

let nextId = 1;
export function reading(t: number, sg: number | null, tempC = 20): ReadingWithGravity {
  return {
    id: nextId++,
    device_id: "ferm-test",
    temperature_c: tempC,
    battery_v: null,
    humidity_pct: null,
    tilt_deg: sg == null ? null : tiltFor(sg),
    created_at: new Date(t).toISOString(),
    gravity_sg: sg,
    gravity_sg_raw: sg,
  };
}

/** One reading every `stepMs` from `from` to `to` inclusive, gravity from `sgAt(t)`. */
export function series(from: number, to: number, stepMs: number, sgAt: (t: number) => number): ReadingWithGravity[] {
  const out: ReadingWithGravity[] = [];
  for (let t = from; t <= to; t += stepMs) out.push(reading(t, Number(sgAt(t).toFixed(4))));
  return out;
}
