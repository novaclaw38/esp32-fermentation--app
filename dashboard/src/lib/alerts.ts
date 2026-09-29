import { formatRelativeTime } from "./connection";

/** Plain-language name for an alert reason, shared by the alert list and the device tiles. */
export function reasonLabel(reason: string): string {
  if (reason === "below_min") return "Below minimum";
  if (reason === "above_max") return "Above maximum";
  if (reason === "sensor_fault") return "Sensor not reading";
  if (reason === "battery_low") return "Battery low";
  return reason;
}

/**
 * One line for a tile's open alert: what it was and how long ago, and -- for a
 * temperature alert whose reading has since returned inside the limits -- that
 * it's back in range. Sensor and battery alerts have no reading to compare.
 */
export function describeOpenAlert(
  alert: { reason: string; createdAt: string },
  temperatureC: number | undefined,
  device: { temp_min_c: number; temp_max_c: number },
  connectionStatus: string,
  now: Date,
): string {
  // Non-breaking space, so a wrapped line never splits "40m" from "ago".
  const age = formatRelativeTime(Math.max(0, (now.getTime() - new Date(alert.createdAt).getTime()) / 1000)).replace(
    " ",
    "\u00a0",
  );
  const label = reasonLabel(alert.reason);
  const isTempAlert = alert.reason === "above_max" || alert.reason === "below_min";
  const backInRange =
    isTempAlert &&
    temperatureC != null &&
    connectionStatus !== "offline" &&
    temperatureC >= device.temp_min_c &&
    temperatureC <= device.temp_max_c;
  return backInRange ? `${label} ${age}; back in range now` : `${label}, ${age}`;
}
