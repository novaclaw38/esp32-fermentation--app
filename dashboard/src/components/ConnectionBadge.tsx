import { useEffect, useState } from "react";
import type { Device } from "../types/database";
import { formatRelativeTime, getConnectionInfo, type ConnectionStatus } from "../lib/connection";

interface Props {
  device: Pick<Device, "last_seen_at" | "sleep_interval_seconds">;
  /** Dot only, no "Xm ago" text -- for a tight list row. */
  compact?: boolean;
}

const STYLES: Record<ConnectionStatus, { dot: string; text: string; label: string }> = {
  online: { dot: "bg-green-500", text: "text-green-700", label: "Online" },
  stale: { dot: "bg-amber-500", text: "text-amber-700", label: "Stale" },
  offline: { dot: "bg-red-500", text: "text-red-700", label: "Offline" },
  never: { dot: "bg-stone-300", text: "text-stone-500", label: "Never checked in" },
};

/**
 * A device has no live connection to poll -- it deep-sleeps between wakes --
 * so "connected" is really "recently checked in, on schedule." That schedule
 * doesn't change just because new data arrived, so this ticks its own clock
 * (`now`) rather than only re-deriving on prop changes: a unit that goes
 * quiet must visibly drift from green to amber to red while the page sits
 * open and nothing else re-renders it.
 */
export default function ConnectionBadge({ device, compact = false }: Props) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const { status, secondsSinceLastSeen } = getConnectionInfo(device, now);
  const style = STYLES[status];

  return (
    <span
      className="inline-flex items-center gap-1.5"
      title={
        status === "never"
          ? "This device has never posted a reading"
          : `Last check-in: ${new Date(device.last_seen_at as string).toLocaleString()}`
      }
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${style.dot} ${status === "online" ? "animate-pulse" : ""}`}
      />
      {!compact && (
        <span className={`text-xs font-medium ${style.text}`}>
          {status === "never" ? style.label : `${style.label} · ${formatRelativeTime(secondsSinceLastSeen as number)}`}
        </span>
      )}
    </span>
  );
}
