import type { Device } from "../types/database";

/**
 * Whether a device is "connected" is inherently fuzzy: it deep-sleeps between
 * readings, so there is no live socket to check — only "when did it last
 * check in, and is that recent enough given how often it's SUPPOSED to check
 * in." `sleep_interval_seconds` is per-device (server-configurable, see
 * get_device_config), so the thresholds below scale with it rather than
 * using a fixed number that would be wrong for a device someone slowed down
 * to conserve battery.
 */
export type ConnectionStatus = "online" | "stale" | "offline" | "never";

export interface ConnectionInfo {
  status: ConnectionStatus;
  /** Null only for `never` -- there is nothing to measure from. */
  secondsSinceLastSeen: number | null;
}

// Multiples of the device's own wake interval, not fixed seconds -- a unit
// sleeping 15 minutes and one sleeping 5 both get the same number of missed
// check-ins before changing color.
//
// ONLINE grace (1.5x) covers ordinary jitter: WiFi association time, a
// stretched cycle from a config fetch or OTA check, clock skew between the
// device and the server.
// STALE ceiling (4x) covers a device that's plausibly still fine but worth a
// look: a couple of missed cycles from a WiFi outage, or it's sitting in the
// setup portal (see WIFI_FAILURES_BEFORE_PORTAL in the firmware) waiting to
// be reconfigured. Past that, treat it as OFFLINE -- something needs
// attention rather than patience.
const ONLINE_MULTIPLE = 1.5;
const STALE_MULTIPLE = 4;

export function getConnectionInfo(
  device: Pick<Device, "last_seen_at" | "sleep_interval_seconds">,
  now: Date = new Date(),
): ConnectionInfo {
  if (!device.last_seen_at) {
    return { status: "never", secondsSinceLastSeen: null };
  }

  const seconds = (now.getTime() - new Date(device.last_seen_at).getTime()) / 1000;
  const interval = device.sleep_interval_seconds;

  let status: ConnectionStatus;
  if (seconds <= interval * ONLINE_MULTIPLE) status = "online";
  else if (seconds <= interval * STALE_MULTIPLE) status = "stale";
  else status = "offline";

  return { status, secondsSinceLastSeen: Math.max(0, seconds) };
}

/** "3m ago", "2h ago", "5d ago" -- compact, for a badge with limited width. */
export function formatRelativeTime(seconds: number): string {
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
