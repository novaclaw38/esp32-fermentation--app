import { useEffect, useState } from "react";

/**
 * The current time, re-read every `intervalMs` and whenever the tab comes back
 * into view. Anything derived from "now" -- connection status, "5m ago",
 * whether a snooze has expired -- has to re-render on its own, or a page left
 * open keeps saying "online" long after a device has died. That is the
 * silent failure this product exists to prevent.
 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = window.setInterval(tick, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs]);

  return now;
}
