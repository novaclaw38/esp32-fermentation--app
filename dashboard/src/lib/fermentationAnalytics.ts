import type { Device, ReadingWithGravity } from "../types/database";
import { computeGravitySg } from "./gravity";

export type FermentationStage = "LAG" | "ACTIVE_FERMENTATION" | "SLOWING" | "STABILIZATION_CLEANUP" | "COMPLETED";

export interface FermentationAnalytics {
  originalGravity: number;
  currentGravity: number;
  abv: number;
  apparentAttenuation: number;
  /** Accounts for alcohol's lower density skewing the apparent hydrometer reading; RA = AA * 0.8114 (Balling). */
  realAttenuation: number;
  /** SG drop per 24h, normalized to however much time the comparison actually spans -- not a naive first-minus-last. Positive = still dropping; can go slightly negative on reading noise. */
  fermentationRatePer24h: number;
  stage: FermentationStage;
  /** False when there isn't yet 48h of gravity history since fermentation_started_at -- a COMPLETED verdict before this is a guess, not a confirmation, so the stage stays STABILIZATION_CLEANUP until it's true. */
  hasFullPlateauWindow: boolean;
}

// An OG this high is where the simple linear ABV formula measurably
// diverges from the true value -- the point past which homebrew calculators
// switch to the Balling-derived formula.
const ADVANCED_ABV_OG_THRESHOLD = 1.06;

/**
 * ABV_standard = (OG - FG) * 131.25 -- accurate for ordinary-strength beers.
 * ABV_advanced (Balling) = 76.08*(OG-FG) / (1.775-OG) * (FG/0.794) -- used
 * above the threshold, where the standard line equation under-reads.
 */
export function computeAbv(og: number, fg: number): number {
  if (og <= fg) return 0;
  if (og > ADVANCED_ABV_OG_THRESHOLD) {
    const denominator = 1.775 - og;
    // Guards a nonsensical/miscalibrated OG from dividing by ~zero or going
    // negative; falls back to the standard line rather than returning a
    // wild number for data this is already suspect.
    if (denominator > 0.01) {
      return (76.08 * (og - fg) * (fg / 0.794)) / denominator;
    }
  }
  return (og - fg) * 131.25;
}

export function computeAttenuation(og: number, fg: number): { apparent: number; real: number } {
  if (og <= 1) return { apparent: 0, real: 0 };
  const apparent = Math.max(0, ((og - fg) / (og - 1.0)) * 100);
  return { apparent, real: apparent * 0.8114 };
}

interface GravityPoint {
  t: number;
  sg: number;
}

const RATE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * SG drop per 24h at `point`, normalized rather than a raw prior-minus-current
 * subtraction: finds the latest earlier point at or before "24h before
 * point" within `points` and scales the drop across it by the time actually
 * elapsed. With under 24h of history behind it, this degrades to that
 * shorter window's average rate rather than refusing to answer --
 * reasonable during the first day, when there's nothing better.
 */
function rateAt(points: GravityPoint[], index: number): number {
  const point = points[index];
  const cutoff = point.t - RATE_WINDOW_MS;

  let ref = points[0];
  for (let i = 0; i <= index; i++) {
    if (points[i].t <= cutoff) ref = points[i];
    else break;
  }

  const elapsedHours = (point.t - ref.t) / (60 * 60 * 1000);
  if (elapsedHours <= 0) return 0;
  return ((ref.sg - point.sg) * 24) / elapsedHours;
}

function fermentationRate(points: GravityPoint[]): number {
  if (points.length < 2) return 0;
  return rateAt(points, points.length - 1);
}

/**
 * The same normalized rate as `fermentationRate`, computed at every point
 * rather than just the latest -- the velocity curve for FermentationRateChart.
 * Points with under ~2h of prior history behind them are dropped: at that
 * span, sensor noise dominates the normalized rate and the number stops
 * meaning anything.
 */
export function computeFermentationRateSeries(
  readings: ReadingWithGravity[],
): { t: number; ratePer24h: number }[] {
  const points = readings
    .filter((r) => r.gravity_sg != null)
    .map((r) => ({ t: new Date(r.created_at).getTime(), sg: r.gravity_sg as number }))
    .sort((a, b) => a.t - b.t);

  const MIN_SPAN_MS = 2 * 60 * 60 * 1000;
  const series: { t: number; ratePer24h: number }[] = [];
  for (let i = 1; i < points.length; i++) {
    if (points[i].t - points[0].t < MIN_SPAN_MS) continue;
    series.push({ t: points[i].t, ratePer24h: rateAt(points, i) });
  }
  return series;
}

const LAG_ATTENUATION_MAX = 5;
const LAG_RATE_MAX = 0.002;
const ACTIVE_RATE_MIN = 0.005;
const SLOWING_RATE_MIN = 0.001;
const PLATEAU_WINDOW_MS = 48 * 60 * 60 * 1000;
const PLATEAU_VARIANCE_MAX = 0.0015;

function determineStage(
  rate: number,
  apparentAttenuation: number,
  points: GravityPoint[],
): { stage: FermentationStage; hasFullPlateauWindow: boolean } {
  if (apparentAttenuation < LAG_ATTENUATION_MAX && rate < LAG_RATE_MAX) {
    return { stage: "LAG", hasFullPlateauWindow: false };
  }
  if (rate >= ACTIVE_RATE_MIN) {
    return { stage: "ACTIVE_FERMENTATION", hasFullPlateauWindow: false };
  }
  if (rate >= SLOWING_RATE_MIN) {
    return { stage: "SLOWING", hasFullPlateauWindow: false };
  }

  // rate < SLOWING_RATE_MIN: either winding down for real, or just stalled.
  // Telling those apart needs a full 48h plateau window -- without one, this
  // reads as "still cleaning up" rather than a premature COMPLETED verdict.
  const latest = points[points.length - 1];
  const windowStart = latest.t - PLATEAU_WINDOW_MS;
  const windowPoints = points.filter((p) => p.t >= windowStart);
  const hasFullPlateauWindow = points[0].t <= windowStart && windowPoints.length >= 2;

  if (!hasFullPlateauWindow) {
    return { stage: "STABILIZATION_CLEANUP", hasFullPlateauWindow };
  }

  const values = windowPoints.map((p) => p.sg);
  const variance = Math.max(...values) - Math.min(...values);
  return {
    stage: variance <= PLATEAU_VARIANCE_MAX ? "COMPLETED" : "STABILIZATION_CLEANUP",
    hasFullPlateauWindow,
  };
}

/**
 * Returns null when analytics can't be computed honestly yet: no OG anchor
 * captured (uncalibrated device, or no calibrated reading has posted since
 * the batch started), or no gravity reading loaded to compare it against.
 * This mirrors the rest of the app's rule against reassurance-shaped
 * placeholders standing in for "we don't actually know yet."
 */
export function computeFermentationAnalytics(
  device: Device,
  readings: ReadingWithGravity[],
): FermentationAnalytics | null {
  if (device.og_tilt_deg == null) return null;

  const og = computeGravitySg(device, device.og_tilt_deg, device.og_temp_c);
  if (og == null) return null;

  const points = readings
    .filter((r) => r.gravity_sg != null)
    .map((r) => ({ t: new Date(r.created_at).getTime(), sg: r.gravity_sg as number }))
    .sort((a, b) => a.t - b.t);
  if (points.length === 0) return null;

  const latest = points[points.length - 1];
  const fg = latest.sg;

  const abv = computeAbv(og, fg);
  const { apparent, real } = computeAttenuation(og, fg);
  const rate = fermentationRate(points);
  const { stage, hasFullPlateauWindow } = determineStage(Math.max(0, rate), apparent, points);

  return {
    originalGravity: Number(og.toFixed(3)),
    currentGravity: Number(fg.toFixed(3)),
    abv: Number(Math.max(0, abv).toFixed(2)),
    apparentAttenuation: Number(apparent.toFixed(1)),
    realAttenuation: Number(real.toFixed(1)),
    fermentationRatePer24h: Number(rate.toFixed(4)),
    stage,
    hasFullPlateauWindow,
  };
}
