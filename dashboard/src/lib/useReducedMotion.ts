import { useState } from "react";

/** True when the visitor has requested reduced motion. Read once at mount -- a live preference change mid-session re-animating every instrument is its own kind of jarring, and no component here needs to react to it changing in place. */
export function usePrefersReducedMotion(): boolean {
  const [reduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );
  return reduced;
}
