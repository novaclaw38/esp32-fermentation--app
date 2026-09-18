const CX = 56;
const CY = 53;
const R = 42;
const START_ANGLE = -120;
const SWEEP = 240;

function pointOnCircle(angleDeg: number, r = R) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + r * Math.sin(rad), y: CY - r * Math.cos(rad) };
}

function describeArc(startDeg: number, endDeg: number, r = R) {
  const start = pointOnCircle(startDeg, r);
  const end = pointOnCircle(endDeg, r);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

/**
 * A dim, dial-shaped placeholder for the device grid's loading state --
 * the instrument's own silhouette rather than a generic gray bar or a
 * spinner, so the wait already looks like the panel it's about to become.
 * Pulses gently in place; no motion that implies a value is arriving faster
 * or slower than it actually is.
 */
export default function GaugeTileSkeleton() {
  return (
    <div className="flex animate-pulse items-center gap-4 rounded-lg border border-panel-700 bg-panel-900 p-4">
      <svg width={56} height={56} viewBox="0 0 112 106" className="shrink-0">
        <path
          d={describeArc(START_ANGLE, START_ANGLE + SWEEP)}
          fill="none"
          stroke="#7a654c"
          strokeWidth={7}
          strokeLinecap="round"
        />
      </svg>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-3 w-2/3 rounded bg-panel-800" />
        <div className="h-2.5 w-1/3 rounded bg-panel-800" />
        <div className="h-2.5 w-1/2 rounded bg-panel-800" />
      </div>
    </div>
  );
}
