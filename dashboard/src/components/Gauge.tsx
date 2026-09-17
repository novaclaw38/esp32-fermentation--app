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
  /**
   * Freshness, folded into the instrument itself rather than a separate
   * status badge sitting outside it -- e.g. "3m ago", "12m ago". Omit when
   * the gauge has never reported (state is already "offline" then, which
   * says everything a badge would have).
   */
  subLabel?: string;
  /**
   * A device that's overdue to check in but not yet counted offline reads
   * as a slightly duller instrument, not a fully dark one -- same vocabulary
   * as the state glow (intensity carries the signal, no new hue).
   */
  stale?: boolean;
  /**
   * Scale endpoints printed at the dial's two ends, e.g. ["0.990", "1.120"].
   * Every gauge in this system reads the same generic way (a needle against
   * a redline) -- swap the label from TEMP to PH and it's an aquarium
   * controller. Specific-gravity notation on the dial face itself is the
   * one thing that can't be relabeled into a different instrument: no
   * unrelated product's gauge shows a decimal scale in this exact
   * convention. Real hydrometers graduate their whole scale; two endpoints
   * is the compact-instrument version (a car's temp gauge often prints just
   * "C" and "H"), sized for a 112px dial without turning it noisy.
   */
  endLabels?: [string, string];
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
  offline: "#9c8a6e", // panel-400
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

// A sighted viewer gets severity for free from hue and glow intensity; a
// screen-reader user was getting only the number and never the word
// "above maximum" -- exactly the gap the four-state vocabulary exists to
// close for everyone else. `state` alone doesn't say which direction a
// breach ran (an open alert can fire on an in-range value too, if it's the
// dedup keeping a stale alert open), so check the raw value against the
// gauge's own range first and fall back to a direction-agnostic word.
function stateAnnouncement(state: GaugeState, value: number | null, min: number, max: number): string {
  if (state === "breached") {
    if (value != null && value > max) return "above maximum";
    if (value != null && value < min) return "below minimum";
    return "alert";
  }
  if (state === "approaching") return "approaching threshold";
  return ""; // nominal needs no extra word; the bare number already says "fine"
}

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
// CY/TRACK_R fix a real bug, not a style choice: the hub sits at a fixed
// point regardless of needle rotation, and the old CY=108/TRACK_R=78 left
// only ~26.5% of the box height genuinely clear below the arc's lower gap
// (200 - (CY + TRACK_R*0.5)). The bottom-anchored text overlay claimed far
// more than that, so the hub -- and the needle segment that always
// originates right next to it -- overlapped the numeral in every state,
// not just the ones a screenshot happened to catch. Raising the pivot
// widens the clear zone to ~34.5%.
const CY = 94;
const TRACK_R = 74;

export default function Gauge({ value, min, max, displayValue, label, state, subLabel, stale = false, endLabels, size = "sm" }: Props) {
  const range = max - min;
  const rawFraction = value == null ? 0 : (value - min) / range;
  // A real needle pins at its travel limit rather than flying off-scale.
  const fraction = Math.min(1, Math.max(0, rawFraction));
  const needleAngle = START_ANGLE + SWEEP * fraction;

  const color = STATE_COLOR[state];
  const glow = STATE_GLOW_PX[state];
  const dim = state === "offline";
  const svgOpacity = dim ? "opacity-40" : stale ? "opacity-75" : "opacity-100";

  const ticks = Array.from({ length: 6 }, (_, i) => START_ANGLE + (SWEEP / 5) * i);
  const approachSpan = SWEEP * APPROACH_FRACTION;

  const dims = size === "lg" ? "h-56 w-56" : "h-28 w-28";
  const numeralClass = size === "lg" ? "text-3xl" : "text-lg";
  const labelClass = size === "lg" ? "text-xs" : "text-[10px]";

  const announcement = dim ? "" : stateAnnouncement(state, value, min, max);

  return (
    <div
      className={`relative ${dims} shrink-0`}
      role="img"
      aria-label={`${label}: ${dim ? "offline" : displayValue}${announcement ? `, ${announcement}` : ""}${subLabel ? `, ${subLabel}` : ""}`}
    >
      <svg viewBox="0 0 200 200" className={`h-full w-full transition-opacity duration-500 ${svgOpacity}`}>
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
        {/* Scale endpoints -- see the endLabels prop doc. */}
        {endLabels && (
          <>
            <text
              x={pointOnCircle(CX, CY, TRACK_R + 12, START_ANGLE).x}
              y={pointOnCircle(CX, CY, TRACK_R + 12, START_ANGLE).y}
              textAnchor="middle"
              fontSize={15}
              fontFamily="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
              fill="#9c8a6e"
            >
              {endLabels[0]}
            </text>
            <text
              x={pointOnCircle(CX, CY, TRACK_R + 12, START_ANGLE + SWEEP).x}
              y={pointOnCircle(CX, CY, TRACK_R + 12, START_ANGLE + SWEEP).y}
              textAnchor="middle"
              fontSize={15}
              fontFamily="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
              fill="#9c8a6e"
            >
              {endLabels[1]}
            </text>
          </>
        )}
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

      {/* Positioned to the dial's actual clear zone (below the arc's lower
          gap, top-[66%] ~= (CY + TRACK_R*0.5)/200), not inset-0 -- inset-0
          let the text claim space the hub and needle also occupy. leading-none
          on the numeral reclaims the line-height slack a single short value
          doesn't need. subLabel is lg-only: the clear zone at sm (112px) fits
          two lines comfortably but not three; freshness still reads through
          the gauge's own opacity (offline 40%, stale 75%) at that size, and
          the full subLabel is one tap away on the detail page's lg gauge. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 top-[66%] flex flex-col items-center justify-center text-center">
        <span
          className={`font-gauge tabular font-semibold leading-none ${numeralClass}`}
          style={{ color: dim ? "#9c8a6e" : "#d9cbb0" }}
        >
          {dim ? "—" : displayValue}
        </span>
        <span className={`mt-1 font-medium uppercase tracking-widest text-panel-400 ${labelClass}`}>{label}</span>
        {subLabel && size === "lg" && (
          <span className="mt-0.5 font-gauge tabular text-xs text-panel-400">{subLabel}</span>
        )}
      </div>
    </div>
  );
}
