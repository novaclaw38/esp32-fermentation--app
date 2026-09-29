export interface TimeInRange {
  /** Length of the period measured: from the first reading in the window to now. */
  totalMs: number;
  inRangeMs: number;
  /** Part of the period with no reading recent enough to count either way. */
  missingMs: number;
  /** Epoch ms of the newest out-of-range reading, or null if there was none. */
  lastOutAt: number | null;
  /** True when the newest reading is out of range. */
  outNow: boolean;
}

/**
 * How long a reading stays true after it arrives, as a multiple of the
 * device's wake interval. Same ceiling lib/connection.ts uses before calling
 * a device offline: a device sleeping between readings is still where it
 * last said it was, up to that point. Beyond it, the time is "missing", not
 * assumed in range.
 */
const HOLD_MULTIPLE = 4;

/**
 * Time a device's temperature spent inside its own limits over a window. Each
 * reading stands for the time until the next one (or until `nowMs`), capped
 * by HOLD_MULTIPLE wake intervals. Returns null when there is nothing in the
 * window to measure.
 */
export function computeTimeInRange(
  readings: { created_at: string; temperature_c: number }[],
  minC: number,
  maxC: number,
  sleepIntervalSeconds: number,
  windowMs: number,
  nowMs: number,
): TimeInRange | null {
  const since = nowMs - windowMs;
  const points = readings
    .map((r) => ({ t: new Date(r.created_at).getTime(), c: r.temperature_c }))
    .filter((p) => p.t >= since && p.t <= nowMs)
    .sort((a, b) => a.t - b.t);
  if (points.length === 0) return null;

  const hold = sleepIntervalSeconds * HOLD_MULTIPLE * 1000;
  let inRangeMs = 0;
  let missingMs = 0;
  let lastOutAt: number | null = null;

  points.forEach((p, i) => {
    const end = i + 1 < points.length ? points[i + 1].t : nowMs;
    const span = end - p.t;
    const counted = Math.min(span, hold);
    missingMs += span - counted;
    const inRange = p.c >= minC && p.c <= maxC;
    if (inRange) inRangeMs += counted;
    else lastOutAt = p.t;
  });

  const last = points[points.length - 1];
  return {
    totalMs: nowMs - points[0].t,
    inRangeMs,
    missingMs,
    lastOutAt,
    outNow: last.c < minC || last.c > maxC,
  };
}
