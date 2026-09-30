/**
 * Round tick values covering [lo, hi], evenly spaced. Recharts picks its own
 * ticks for a numeric axis, but with a padded domain it puts one at each end of
 * the domain and rounds the ones in between, giving axes like 1.065 / 1.040 /
 * 1.025 / 1.010 or 17 / 20 / 23 / 27 -- unevenly spaced, so the scale can't be
 * read at a glance. This picks a 1/2/5 step instead, and the chart uses the
 * first and last tick as its domain.
 *
 * `target` is the number of intervals wanted; `minStep` stops the step going
 * below what the axis can label (whole degrees, half a gravity point).
 */
export function niceTicks(
  lo: number,
  hi: number,
  { target = 5, minStep = 0 }: { target?: number; minStep?: number } = {},
): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [];
  if (hi < lo) [lo, hi] = [hi, lo];

  const rough = Math.max((hi - lo) / target, minStep, 1e-9);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= rough - 1e-12) ?? 10 * magnitude;

  const first = Math.floor(lo / step + 1e-9);
  let last = Math.ceil(hi / step - 1e-9);
  if (last === first) last = first + 1;

  const ticks: number[] = [];
  for (let i = first; i <= last; i++) ticks.push(Number((i * step).toFixed(10)));
  return ticks;
}
