import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "../lib/useReducedMotion";
import { palette } from "../lib/tokens";

// Same 240°-sweep grammar as Gauge.tsx (duplicated, not imported -- Gauge's
// geometry is a live-reading instrument; this is a static wordmark glyph, a
// different job that happens to share a visual vocabulary). The needle
// settles at a fixed "nominal" angle, not a real reading -- it's a mark, not
// a gauge, and never claims to measure anything.
const CX = 20;
const CY = 19;
const R = 15;
const START_ANGLE = -120;
const SWEEP = 240;
const REST_FRACTION = 0.62;

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

const restAngle = START_ANGLE + SWEEP * REST_FRACTION;

/**
 * The product's instrument-panel identity, condensed to a mark: the same
 * dial/needle/glow grammar as every live gauge, at rest. On mount (once,
 * never looping) the needle sweeps from zero to its resting angle and the
 * glow fades in -- the one authored moment on the sign-in threshold, the
 * first surface a visitor reaches before any real instrument has data to
 * show. Skips straight to the resting frame under prefers-reduced-motion.
 */
export default function InstrumentMark({ size = 40 }: { size?: number }) {
  const reducedMotion = usePrefersReducedMotion();
  const [settled, setSettled] = useState(reducedMotion);

  useEffect(() => {
    if (settled) return;
    const t = setTimeout(() => setSettled(true), 20);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const needleAngle = settled ? restAngle : START_ANGLE;

  return (
    <svg width={size} height={size} viewBox="0 0 40 38" role="img" aria-label="Fermentation Monitor">
      <path d={describeArc(START_ANGLE, START_ANGLE + SWEEP)} fill="none" stroke={palette.panel[500]} strokeWidth={2.5} strokeLinecap="round" />
      {[0, 1, 2, 3, 4].map((i) => {
        const angle = START_ANGLE + (SWEEP / 4) * i;
        const inner = pointOnCircle(angle, R - 3);
        const outer = pointOnCircle(angle, R - 0.5);
        return <line key={i} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke={palette.panel[400]} strokeWidth={1.2} />;
      })}
      <g
        style={{
          transform: `rotate(${needleAngle}deg)`,
          transformOrigin: `${CX}px ${CY}px`,
          // The glow fades up as the needle arrives rather than switching on:
          // filter only transitions between matching function lists, so it's
          // a 0px drop-shadow at rest, not `undefined`.
          transition: "transform 900ms cubic-bezier(0.16, 1, 0.3, 1), filter 600ms ease-out 450ms",
          filter: `drop-shadow(0 0 ${settled ? 3 : 0}px ${palette.brew[400]})`,
        }}
      >
        <line x1={CX} y1={CY - R + 4} x2={CX} y2={CY - 3} stroke={palette.brew[400]} strokeWidth={2} strokeLinecap="round" />
      </g>
      <circle
        cx={CX}
        cy={CY}
        r={2.3}
        fill={palette.brew[400]}
        style={{ opacity: settled ? 1 : 0, transition: "opacity 500ms ease-out 400ms" }}
      />
    </svg>
  );
}
