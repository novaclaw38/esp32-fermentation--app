import { describe, expect, it } from "vitest";
import { describeOpenAlert } from "../alerts";

describe("describeOpenAlert", () => {
  const now = new Date("2026-09-29T12:00:00Z");
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();
  const limits = { temp_min_c: 22, temp_max_c: 28 };

  it("states the reason and age while the reading is still out of range", () => {
    const text = describeOpenAlert({ reason: "above_max", createdAt: ago(40) }, 29, limits, "online", now);
    expect(text).toBe("Above maximum, 40m\u00a0ago");
  });

  it("says a temperature alert is back in range once the reading returns", () => {
    const text = describeOpenAlert({ reason: "above_max", createdAt: ago(40) }, 27.5, limits, "online", now);
    expect(text).toBe("Above maximum 40m\u00a0ago; back in range now");
  });

  it("never claims recovery for an offline device or one with no reading", () => {
    expect(describeOpenAlert({ reason: "below_min", createdAt: ago(120) }, 25, limits, "offline", now)).toBe(
      "Below minimum, 2h\u00a0ago",
    );
    expect(describeOpenAlert({ reason: "below_min", createdAt: ago(120) }, undefined, limits, "online", now)).toBe(
      "Below minimum, 2h\u00a0ago",
    );
  });

  it("has nothing to compare for sensor and battery alerts", () => {
    expect(describeOpenAlert({ reason: "sensor_fault", createdAt: ago(3 * 24 * 60) }, 25, limits, "online", now)).toBe(
      "Sensor not reading, 3d\u00a0ago",
    );
    expect(describeOpenAlert({ reason: "battery_low", createdAt: ago(5) }, 25, limits, "online", now)).toBe(
      "Battery low, 5m\u00a0ago",
    );
  });
});
