import type { GaugeState } from "../lib/gaugeState";

interface Props {
  /** Raw value in the same unit as min/max -- needle position is threshold-relative, so this stays °C even when displayValue shows °F. */
  value: number | null;
  min: number;
  max: number;
  /** What the center numeral shows -- already formatted, already in whatever unit the viewer chose. */
  displayValue: string;
  /** Instrument name, e.g. "TEMP", "GRAVITY", "BATTERY". */
  label: string;
  state: GaugeState;
  size?: "sm" | "lg";
}

// A 240° sweep with a 120° gap at the bottom -- the classic speedometer
// face, not a full circle. Angles measured clockwise from 12 o'clock (0°).
const START_ANGLE = -120;
const SWEEP = 240;
const APPROACH_FRACTION = 0.1;

const STATE_COLOR: Record<GaugeState, string> = {
  nominal: "#dd9834", // brew-400
  approaching: "#fb923c", // approach-400
  breached: "#f87171", // breach-400
  offline: "#8a7a63", // panel-400
};

// The "alert-brightness hierarchy" raise: a breached needle isn't just a
// different color, its glow is measurably bigger than nominal's -- severity
// reads as intensity, not only hue, which still works for a colorblind
// reader and at a glance before hue registers at all.
const STATE_GLOW_PX: Record<GaugeState, number> = {
  nominal: 3,
  approaching: 5,
  breached: 9,
  offline: 0,
};

function pointOnCircle(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const start = pointOnCircle(cx, cy, r, startDeg);
  const end = pointOnCircle(cx, cy, r, endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

const CX = 100;
const CY = 108;
const TRACK_R = 78;

export default function Gauge({ value, min, max, displayValue, label, state, size = "sm" }: Props) {
  const range = max - min;
  const rawFraction = value == null ? 0 : (value - min) / range;
  // A real needle pins at its travel limit rather than flying off-scale.
  const fraction = Math.min(1, Math.max(0, rawFraction));
  const needleAngle = START_ANGLE + SWEEP * fraction;

  const color = STATE_COLOR[state];
  const glow = STATE_GLOW_PX[state];
  const dim = state === "offline";

  const ticks = Array.from({ length: 6 }, (_, i) => START_ANGLE + (SWEEP / 5) * i);
  const approachSpan = SWEEP * APPROACH_FRACTION;

  const dims = size === "lg" ? "h-56 w-56" : "h-28 w-28";
  const numeralClass = size === "lg" ? "text-3xl" : "text-lg";
  const labelClass = size === "lg" ? "text-xs" : "text-[10px]";

  return (
    <div className={`relative ${dims} shrink-0`} role="img" aria-label={`${label}: ${dim ? "offline" : displayValue}`}>
      <svg viewBox="0 0 200 200" className={`h-full w-full transition-opacity duration-500 ${dim ? "opacity-40" : "opacity-100"}`}>
        {/* Track */}
        <path
          d={describeArc(CX, CY, TRACK_R, START_ANGLE, START_ANGLE + SWEEP)}
          fill="none"
          stroke="#332a20"
          strokeWidth={10}
          strokeLinecap="round"
        />
        {/* Redline zones -- static reference showing where this device's own
            thresholds sit on the dial, independent of the current reading. */}
        <path
          d={describeArc(CX, CY, TRACK_R, START_ANGLE, START_ANGLE + approachSpan)}
          fill="none"
          stroke="#f87171"
          strokeWidth={3}
          strokeLinecap="round"
          opacity={0.35}
        />
        <path
          d={describeArc(CX, CY, TRACK_R, START_ANGLE + SWEEP - approachSpan, START_ANGLE + SWEEP)}
          fill="none"
          stroke="#f87171"
          strokeWidth={3}
          strokeLinecap="round"
          opacity={0.35}
        />
        {/* Tick marks */}
        {ticks.map((angle, i) => {
          const inner = pointOnCircle(CX, CY, TRACK_R - 12, angle);
          const outer = pointOnCircle(CX, CY, TRACK_R - 2, angle);
          return (
            <line
              key={i}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke="#453829"
              strokeWidth={2}
            />
          );
        })}
        {/* Needle -- rotated via transform, eased, around the dial center. This is the "moving gauge." */}
        <g
          style={{
            transform: `rotate(${needleAngle}deg)`,
            transformOrigin: `${CX}px ${CY}px`,
            transition: "transform 700ms cubic-bezier(0.4, 0, 0.2, 1)",
            filter: glow ? `drop-shadow(0 0 ${glow}px ${color})` : undefined,
          }}
        >
          <line x1={CX} y1={CY - TRACK_R + 16} x2={CX} y2={CY - 10} stroke={color} strokeWidth={3} strokeLinecap="round" />
        </g>
        <circle cx={CX} cy={CY} r={6} fill={color} style={glow ? { filter: `drop-shadow(0 0 ${glow}px ${color})` } : undefined} />
      </svg>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end pb-3 text-center">
        <span
          className={`font-gauge tabular font-semibold ${numeralClass}`}
          style={{ color: dim ? "#8a7a63" : "#d9cbb0" }}
        >
          {dim ? "—" : displayValue}
        </span>
        <span className={`mt-0.5 font-medium uppercase tracking-widest text-panel-400 ${labelClass}`}>{label}</span>
      </div>
    </div>
  );
}
