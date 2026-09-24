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
