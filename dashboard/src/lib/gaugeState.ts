import type { ConnectionStatus } from "./connection";

/**
 * The instrument's own state vocabulary -- distinct from the alert system's
 * below_min/above_max/consecutive-breach-count logic (see ingest_reading in
 * the migrations). An alert requires several consecutive bad readings before
 * it fires, by design, so a single momentary excursion is real signal for a
 * gauge to show even before the backend would ever post an alert about it.
 * "approaching" has no alert-system equivalent at all -- it exists only so
 * the panel can warn before a value actually leaves range, not just after.
 */
export type GaugeState = "nominal" | "approaching" | "breached" | "offline";

/** How close to an edge counts as "approaching" it, as a fraction of the full range. */
const APPROACH_FRACTION = 0.1;

export function getGaugeState(
  value: number | null,
  min: number,
  max: number,
  connectionStatus: ConnectionStatus,
  hasOpenAlert: boolean,
): GaugeState {
  if (connectionStatus === "offline" || connectionStatus === "never" || value == null) {
    return "offline";
  }
  if (hasOpenAlert || value < min || value > max) {
    return "breached";
  }

  const margin = (max - min) * APPROACH_FRACTION;
  if (value - min <= margin || max - value <= margin) {
    return "approaching";
  }

  return "nominal";
}
