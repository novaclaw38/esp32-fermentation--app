import { describe, expect, it } from "vitest";
import { timeTicks } from "../chartTime";
import { computeTimeInRange } from "../timeInRange";

const HOUR = 3_600_000;

describe("timeTicks", () => {
  it("puts every tick of a 48-hour chart on a 6-hour local boundary", () => {
    const min = new Date(2026, 8, 27, 20, 44).getTime();
    const max = min + 48 * HOUR;
    const ticks = timeTicks(min, max);
    expect(ticks.length).toBeGreaterThanOrEqual(7);
    expect(ticks.length).toBeLessThanOrEqual(9);
    for (const t of ticks) {
      const d = new Date(t);
      expect(d.getMinutes()).toBe(0);
      expect(d.getHours() % 6).toBe(0);
      expect(t).toBeGreaterThanOrEqual(min);
      expect(t).toBeLessThanOrEqual(max);
    }
    expect([...ticks].sort((a, b) => a - b)).toEqual(ticks);
  });

  it("uses finer steps for a short chart and coarser for a long one", () => {
    const start = new Date(2026, 8, 27, 9, 10).getTime();
    const short = timeTicks(start, start + 6 * HOUR);
    expect(new Date(short[1]).getTime() - new Date(short[0]).getTime()).toBe(HOUR);
    const long = timeTicks(start, start + 14 * 24 * HOUR);
    const gapHours = (long[1] - long[0]) / HOUR;
    expect(gapHours).toBeGreaterThanOrEqual(24);
  });

  it("returns nothing for an empty or reversed range", () => {
    expect(timeTicks(5, 5)).toEqual([]);
    expect(timeTicks(10, 5)).toEqual([]);
  });
});

describe("computeTimeInRange", () => {
  const now = Date.parse("2026-09-29T12:00:00Z");
  const at = (hoursAgo: number, c: number) => ({
    created_at: new Date(now - hoursAgo * HOUR).toISOString(),
    temperature_c: c,
  });
  const interval = 900; // 15 minutes; a reading holds for up to an hour

  it("counts all time in range when nothing leaves it", () => {
    const readings = Array.from({ length: 9 }, (_, i) => at(2 - i * 0.25, 25));
    const r = computeTimeInRange(readings, 22, 28, interval, 48 * HOUR, now)!;
    expect(r.inRangeMs).toBeCloseTo(2 * HOUR, -3);
    expect(r.totalMs).toBeCloseTo(2 * HOUR, -3);
    expect(r.lastOutAt).toBeNull();
    expect(r.outNow).toBe(false);
    expect(r.missingMs).toBe(0);
  });

  it("finds the last excursion and whether it is still going", () => {
    const readings = [at(3, 25), at(2.75, 25), at(2.5, 29), at(2.25, 25), at(2, 25)];
    const r = computeTimeInRange(readings, 22, 28, interval, 48 * HOUR, now)!;
    expect(r.lastOutAt).toBe(now - 2.5 * HOUR);
    expect(r.outNow).toBe(false);
    expect(r.inRangeMs).toBeLessThan(r.totalMs);

    const stillOut = computeTimeInRange([at(1, 25), at(0.5, 29)], 22, 28, interval, 48 * HOUR, now)!;
    expect(stillOut.outNow).toBe(true);
  });

  it("does not credit long gaps as in range", () => {
    // One in-range reading 10 hours ago, then silence: only the hold counts.
    const r = computeTimeInRange([at(10, 25)], 22, 28, interval, 48 * HOUR, now)!;
    expect(r.inRangeMs).toBe(4 * interval * 1000);
    expect(r.missingMs).toBe(10 * HOUR - 4 * interval * 1000);
  });

  it("ignores readings outside the window and returns null when none remain", () => {
    expect(computeTimeInRange([at(60, 25)], 22, 28, interval, 48 * HOUR, now)).toBeNull();
    expect(computeTimeInRange([], 22, 28, interval, 48 * HOUR, now)).toBeNull();
  });
});
