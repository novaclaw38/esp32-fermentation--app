/**
 * The one absolute timestamp format in the dashboard: "Sep 23, 08:51".
 * Chart axes, tooltips, alerts, snooze and batch dates all use it, so a time
 * reads the same wherever it appears. Relative times ("4m ago") stay in
 * lib/connection.ts for freshness only.
 */
export function formatDateTime(t: number | string | Date): string {
  return new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Tick/tooltip label for a numeric time axis. */
export const formatAxisTime = (t: number) => formatDateTime(t);

const HOUR_MS = 3_600_000;
const TICK_STEPS_HOURS = [1, 2, 3, 6, 12, 24, 48];

/**
 * Axis ticks on clean local-time boundaries (every 6 hours on a 48-hour
 * chart: midnight, 6 AM, noon, 6 PM). Recharts' own numeric ticks are evenly
 * spaced from the first reading, so they landed on times like 07:14 AM that
 * mean nothing to the person reading the chart. Recharts still drops ticks
 * that would overlap, so a narrow screen keeps a clean subset.
 */
export function timeTicks(min: number, max: number, maxTicks = 8): number[] {
  if (!(max > min)) return [];
  const spanHours = (max - min) / HOUR_MS;
  const step = TICK_STEPS_HOURS.find((h) => spanHours / h <= maxTicks) ?? 48;

  // Walk in local hours (setHours) rather than adding milliseconds, so a
  // daylight-saving change doesn't push ticks off the boundary.
  const d = new Date(min);
  d.setMinutes(0, 0, 0);
  while (d.getTime() < min || d.getHours() % step !== 0) d.setHours(d.getHours() + 1);

  const ticks: number[] = [];
  while (d.getTime() <= max && ticks.length < 100) {
    ticks.push(d.getTime());
    d.setHours(d.getHours() + step);
  }
  return ticks;
}

/** Label for a tick from timeTicks: "Mon 6 PM". The full date and time stay in the tooltip. */
export function formatTickTime(t: number): string {
  return new Date(t).toLocaleString(undefined, { weekday: "short", hour: "numeric" });
}

/**
 * Charts plot against real time (a numeric axis), so a device that was off
 * for ten hours shows a ten-hour gap instead of two readings drawn side by
 * side. Recharts still joins consecutive points with a line, though, so a
 * null-valued point is inserted into any gap far longer than the device's
 * usual spacing -- that breaks the line there instead of drawing a
 * confident-looking straight segment across time with no data in it.
 */
export function withGaps<T extends { t: number }>(points: T[], gapPoint: (t: number) => T): T[] {
  if (points.length < 3) return points;
  const deltas = points.slice(1).map((p, i) => p.t - points[i].t).sort((a, b) => a - b);
  const median = deltas[Math.floor(deltas.length / 2)];
  const threshold = Math.max(median * 4, 5 * 60 * 1000);

  const out: T[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (points[i].t - points[i - 1].t > threshold) {
      out.push(gapPoint((points[i].t + points[i - 1].t) / 2));
    }
    out.push(points[i]);
  }
  return out;
}

/** Date-only companion to formatDateTime: "Sep 4, 2026". */
export function formatDate(t: number | string | Date): string {
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
