import { describe, expect, it } from "vitest";
import {
  ANALYTICS_HISTORY_HOURS,
  computeAbv,
  computeAttenuation,
  computeFermentationAnalytics,
  computeFermentationRateSeries,
} from "../fermentationAnalytics";
import { HOUR, makeDevice, series, tiltFor } from "./fixtures";

const NOW = Date.UTC(2026, 8, 23, 12);
const STEP = 15 * 60 * 1000;

/** A batch that dropped 1.050 -> 1.010 over its first 20h, then sat flat. */
function finishedBatch(startedHoursAgo: number, loadedHours: number) {
  const start = NOW - startedHoursAgo * HOUR;
  const device = makeDevice({
    og_tilt_deg: tiltFor(1.05),
    og_temp_c: 20,
    fermentation_started_at: new Date(start).toISOString(),
  });
  // The page fetches "since now - N hours", and the newest reading always
  // predates the fetch by a few minutes -- model that, or a reading landing
  // exactly on the window edge hides the bug this file guards against.
  const all = series(start, NOW - 5 * 60 * 1000, STEP, (t) => {
    const h = (t - start) / HOUR;
    return h >= 20 ? 1.01 : 1.05 - (0.04 * h) / 20;
  });
  const loaded = all.filter((r) => new Date(r.created_at).getTime() >= NOW - loadedHours * HOUR);
  return { device, loaded };
}

describe("computeFermentationAnalytics", () => {
  it("reaches COMPLETED once gravity has held flat for 48h, with the history the page loads", () => {
    const { device, loaded } = finishedBatch(100, ANALYTICS_HISTORY_HOURS);
    const a = computeFermentationAnalytics(device, loaded)!;
    expect(a.stage).toBe("COMPLETED");
    expect(a.hasFullPlateauWindow).toBe(true);
    expect(a.originalGravity).toBe(1.05);
    expect(a.currentGravity).toBe(1.01);
  });

  it("can never confirm COMPLETED from exactly 48h of history (the old page window)", () => {
    // Regression guard for the audit's P0: the plateau check needs a point at
    // or before latest-48h, which a 48h fetch can't contain.
    const { device, loaded } = finishedBatch(100, 48);
    const a = computeFermentationAnalytics(device, loaded)!;
    expect(a.hasFullPlateauWindow).toBe(false);
    expect(a.stage).toBe("STABILIZATION_CLEANUP");
  });

  it("ignores readings from before the current batch started", () => {
    const start = NOW - 6 * HOUR;
    const device = makeDevice({
      og_tilt_deg: tiltFor(1.06),
      og_temp_c: 20,
      fermentation_started_at: new Date(start).toISOString(),
    });
    // Previous batch: finished and flat at 1.005 right up to the new pitch.
    const previous = series(NOW - 72 * HOUR, start - STEP, STEP, () => 1.005);
    // New batch: dropping fast, 1.060 -> 1.050 over 6h.
    const current = series(start, NOW, STEP, (t) => 1.06 - (0.01 * (t - start)) / (6 * HOUR));

    const a = computeFermentationAnalytics(device, [...previous, ...current])!;
    expect(a.stage).toBe("ACTIVE_FERMENTATION");
    expect(a.fermentationRatePer24h).toBeGreaterThan(0.03);

    const rates = computeFermentationRateSeries([...previous, ...current], device.fermentation_started_at);
    expect(rates.every((p) => p.t >= start)).toBe(true);
  });

  it("returns null without an OG anchor", () => {
    const { loaded } = finishedBatch(100, 72);
    expect(computeFermentationAnalytics(makeDevice(), loaded)).toBeNull();
  });
});

describe("ABV and attenuation", () => {
  it("uses the standard formula for ordinary gravities", () => {
    expect(computeAbv(1.05, 1.01)).toBeCloseTo(5.25, 2);
  });

  it("switches to the Balling formula above 1.060", () => {
    const abv = computeAbv(1.09, 1.015);
    expect(abv).toBeGreaterThan((1.09 - 1.015) * 131.25);
  });

  it("never reports negative ABV", () => {
    expect(computeAbv(1.01, 1.02)).toBe(0);
  });

  it("computes apparent and real attenuation", () => {
    const { apparent, real } = computeAttenuation(1.05, 1.01);
    expect(apparent).toBeCloseTo(80, 5);
    expect(real).toBeCloseTo(80 * 0.8114, 5);
  });
});
