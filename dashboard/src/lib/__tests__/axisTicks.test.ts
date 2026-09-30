import { describe, expect, it } from "vitest";
import { niceTicks } from "../axisTicks";

const spacing = (t: number[]) => t.slice(1).map((v, i) => Number((v - t[i]).toFixed(9)));

describe("niceTicks", () => {
  it("evenly spaces a gravity axis on round values", () => {
    const t = niceTicks(1.0127, 1.0578, { minStep: 0.005 });
    expect(t[0]).toBeLessThanOrEqual(1.0127);
    expect(t[t.length - 1]).toBeGreaterThanOrEqual(1.0578);
    expect(new Set(spacing(t)).size).toBe(1);
    expect(t).toEqual([1.01, 1.02, 1.03, 1.04, 1.05, 1.06]);
  });

  it("keeps a temperature axis on whole degrees", () => {
    const t = niceTicks(17.5, 26.5, { minStep: 1 });
    expect(t.every(Number.isInteger)).toBe(true);
    expect(new Set(spacing(t)).size).toBe(1);
    expect(t[0]).toBeLessThanOrEqual(17.5);
    expect(t[t.length - 1]).toBeGreaterThanOrEqual(26.5);
  });

  it("never goes below the minimum step, even for a very narrow range", () => {
    const t = niceTicks(21.2, 21.6, { minStep: 1 });
    expect(spacing(t).every((s) => s >= 1)).toBe(true);
    expect(t.length).toBeGreaterThanOrEqual(2);
  });

  it("handles a flat series and reversed or invalid input", () => {
    expect(niceTicks(1.012, 1.012, { minStep: 0.005 }).length).toBeGreaterThanOrEqual(2);
    expect(niceTicks(10, 0)).toEqual(niceTicks(0, 10));
    expect(niceTicks(NaN, 5)).toEqual([]);
  });

  it("includes zero on a rate axis that spans it", () => {
    const t = niceTicks(-0.0065, 0.0388, { minStep: 0.001 });
    expect(t).toContain(0);
    expect(new Set(spacing(t)).size).toBe(1);
  });
});
