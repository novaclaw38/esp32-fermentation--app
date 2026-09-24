import { describe, expect, it } from "vitest";
import { formatRelativeTime, getConnectionInfo } from "../connection";
import { getGaugeState } from "../gaugeState";
import { computeGravitySg, hydrometerTempFactor } from "../gravity";
import { withGaps } from "../chartTime";
import { celsiusToUnit, formatTemp } from "../units";
import { makeDevice } from "./fixtures";

describe("getConnectionInfo", () => {
  const now = new Date("2026-09-23T12:00:00Z");
  const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000).toISOString();

  it("scales with the device's own interval", () => {
    expect(getConnectionInfo({ last_seen_at: at(20), sleep_interval_seconds: 900 }, now).status).toBe("online");
    expect(getConnectionInfo({ last_seen_at: at(30), sleep_interval_seconds: 900 }, now).status).toBe("stale");
    expect(getConnectionInfo({ last_seen_at: at(61), sleep_interval_seconds: 900 }, now).status).toBe("offline");
    expect(getConnectionInfo({ last_seen_at: null, sleep_interval_seconds: 900 }, now).status).toBe("never");
  });

  it("goes stale on its own as time passes -- the frozen-clock P0", () => {
    const device = { last_seen_at: at(5), sleep_interval_seconds: 900 };
    expect(getConnectionInfo(device, now).status).toBe("online");
    const later = new Date(now.getTime() + 2 * 60 * 60_000);
    expect(getConnectionInfo(device, later).status).toBe("offline");
  });

  it("formats relative time compactly", () => {
    expect(formatRelativeTime(30)).toBe("just now");
    expect(formatRelativeTime(5 * 60)).toBe("5m ago");
    expect(formatRelativeTime(3 * 3600)).toBe("3h ago");
    expect(formatRelativeTime(2 * 86400)).toBe("2d ago");
  });
});

describe("getGaugeState", () => {
  it("reads offline before anything else", () => {
    expect(getGaugeState(20, 18, 24, "offline", true)).toBe("offline");
    expect(getGaugeState(null, 18, 24, "online", false)).toBe("offline");
  });
  it("breaches outside range or with an open alert", () => {
    expect(getGaugeState(25, 18, 24, "online", false)).toBe("breached");
    expect(getGaugeState(21, 18, 24, "online", true)).toBe("breached");
  });
  it("warns within 10% of either edge", () => {
    expect(getGaugeState(18.5, 18, 24, "online", false)).toBe("approaching");
    expect(getGaugeState(23.5, 18, 24, "online", false)).toBe("approaching");
    expect(getGaugeState(21, 18, 24, "stale", false)).toBe("nominal");
  });
});

describe("gravity", () => {
  it("applies no correction at the calibration temperature", () => {
    const d = makeDevice({ calibration_temp_c: 20 });
    expect(computeGravitySg(d, 50, 20)).toBeCloseTo(1.05, 10);
  });
  it("corrects relative to the calibration temperature, not a fixed 20C", () => {
    const d = makeDevice({ calibration_temp_c: 24 });
    const corrected = computeGravitySg(d, 50, 24);
    expect(corrected).toBeCloseTo(1.05, 10);
    // A warm sample is less dense and reads low; correcting to 20C raises it.
    const warm = computeGravitySg(makeDevice({ calibration_temp_c: 20 }), 50, 30)!;
    expect(warm).toBeGreaterThan(1.05);
    expect(hydrometerTempFactor(30)).toBeGreaterThan(hydrometerTempFactor(20));
  });
  it("reports null for an uncalibrated device", () => {
    expect(computeGravitySg(makeDevice({ calibration_c: null }), 50, 20)).toBeNull();
  });
});

describe("withGaps", () => {
  it("breaks the line across a gap far longer than the usual spacing", () => {
    const pts = [0, 1, 2, 3, 20, 21].map((m) => ({ t: m * 15 * 60_000, v: m as number | null }));
    const out = withGaps(pts, (t) => ({ t, v: null }));
    expect(out).toHaveLength(pts.length + 1);
    expect(out[4].v).toBeNull();
  });
  it("leaves evenly spaced data alone", () => {
    const pts = [0, 1, 2, 3, 4].map((m) => ({ t: m * 60_000 }));
    expect(withGaps(pts, (t) => ({ t }))).toHaveLength(5);
  });
});

describe("units", () => {
  it("converts for display only", () => {
    expect(celsiusToUnit(100, "F")).toBe(212);
    expect(formatTemp(20, "F")).toBe("68.0°F");
    expect(formatTemp(null, "C")).toBe("—");
  });
});
