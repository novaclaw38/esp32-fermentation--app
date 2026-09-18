import { useId } from "react";
import type { GaugeState } from "../lib/gaugeState";
import { usePrefersReducedMotion } from "../lib/useReducedMotion";

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

// Needle geometry: a tapered quadrilateral, not a uniform-width line. A
// critique caught the old flat 3px line reading as a stray ruler mark
// rather than a mechanical part -- wider at the pivot, narrower at the
// tip is what makes a needle read as a thing with mass instead of a
// diagram of one.
const NEEDLE_TIP_Y = CY - TRACK_R + 16;
const NEEDLE_BASE_Y = CY - 10;
const NEEDLE_BASE_HALF_WIDTH = 2.4;
const NEEDLE_TIP_HALF_WIDTH = 0.6;

export default function Gauge({ value, min, max, displayValue, label, state, subLabel, stale = false, endLabels, size = "sm" }: Props) {
  // The needle rotation and opacity fade still have to happen -- they carry
  // the state change, not just decorate it -- but under reduced motion they
  // snap to the new frame instead of animating into it.
  const reducedMotion = usePrefersReducedMotion();
  const gradId = useId();
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
  // Fine graduation between the majors, gravity-only (see endLabels doc) --
  // a real hydrometer prints a graduated scale, not six even dashes. This is
  // the one place the dial's actual silhouette, not just its label content,
  // differs by instrument: the gravity gauge is visibly finer-scaled than
  // Temp/Battery, which read identically to each other on purpose.
  const minorTicks = endLabels ? Array.from({ length: 5 }, (_, i) => START_ANGLE + (SWEEP / 10) * (2 * i + 1)) : [];
  const approachSpan = SWEEP * APPROACH_FRACTION;

  const dims = size === "lg" ? "h-56 w-56" : "h-28 w-28";
  const numeralClass = size === "lg" ? "text-3xl" : "text-lg";
  const labelClass = size === "lg" ? "text-xs" : "text-[10px]";
  // endLabels crowded the track's rounded end-caps at sm -- same fixed 15px
  // font the lg dial uses, on a dial with less than half the radius to fit it.
  const endLabelFontSize = size === "lg" ? 15 : 10;
  const endLabelOffset = size === "lg" ? 12 : 8;

  const announcement = dim ? "" : stateAnnouncement(state, value, min, max);

  return (
    <div
      className={`relative ${dims} shrink-0`}
      role="img"
      aria-label={`${label}: ${dim ? "offline" : displayValue}${announcement ? `, ${announcement}` : ""}${subLabel ? `, ${subLabel}` : ""}`}
    >
      <svg viewBox="0 0 200 200" className={`h-full w-full ${reducedMotion ? "" : "transition-opacity duration-500"} ${svgOpacity}`}>
        <defs>
          {/* Dial face -- a critique found the arcs floating directly on the
              card background with nothing enclosing them, so the instrument
              never resolved into an object, only a diagram of one. A faint
              off-center dish (panel-raised to panel-ground, the system's own
              neutral steps -- no new hue) gives it a material surface to sit
              on. useId keeps this unique per gauge instance; without it every
              <svg> on a page (the device grid renders several) would define
              the same #id and SVG resolves url(#id) to the first match in
              the document, silently sharing one gauge's gradient with all
              the others. */}
          <radialGradient id={`dial-face-${gradId}`} cx="35%" cy="28%" r="80%">
            <stop offset="0%" stopColor="#262019" />
            <stop offset="100%" stopColor="#14110e" />
          </radialGradient>
        </defs>
        <circle cx={CX} cy={CY} r={TRACK_R - 6} fill={`url(#dial-face-${gradId})`} />
        {/* Track. panel-700 (#332a20), the border-scale token this used to
            borrow, sits at 1.26:1 against the panel-900/950 surfaces this
            gauge renders on -- effectively invisible, and with it gone the
            needle floats with no scale to read it against. This value is
            gauge-specific (not a shared panel token) chosen to clear
            WCAG's 3:1 non-text-contrast floor against both surfaces. */}
        <path
          d={describeArc(CX, CY, TRACK_R, START_ANGLE, START_ANGLE + SWEEP)}
          fill="none"
          stroke="#7a654c"
          strokeWidth={10}
          strokeLinecap="round"
        />
        {/* Redline zones -- static reference showing where this device's own
            thresholds sit on the dial, independent of the current reading.
            Widened/brightened after a critique found the original 3px/35%
            opacity version functionally invisible at the 112px size used in
            the device grid -- the surface most people actually scan. */}
        <path
          d={describeArc(CX, CY, TRACK_R, START_ANGLE, START_ANGLE + approachSpan)}
          fill="none"
          stroke="#f87171"
          strokeWidth={4}
          strokeLinecap="round"
          opacity={0.55}
        />
        <path
          d={describeArc(CX, CY, TRACK_R, START_ANGLE + SWEEP - approachSpan, START_ANGLE + SWEEP)}
          fill="none"
          stroke="#f87171"
          strokeWidth={4}
          strokeLinecap="round"
          opacity={0.55}
        />
        {/* Tick marks. Was panel-600 (#453829, 1.57:1 against panel-900/950
            -- the same near-invisible problem as the track). panel-400
            (#9c8a6e) is the system's own verified-accessible secondary-text
            color (5.31:1 / 5.62:1), brighter than the track so the ticks
            still read as discrete marks rather than blending into the ring.
            The two end ticks (min/max) run longer and heavier than the four
            between them -- a major/minor hierarchy where a flat set of six
            identical dashes read as decorative rather than instrumental. */}
        {ticks.map((angle, i) => {
          const isMajor = i === 0 || i === ticks.length - 1;
          const inner = pointOnCircle(CX, CY, TRACK_R - (isMajor ? 15 : 10), angle);
          const outer = pointOnCircle(CX, CY, TRACK_R - 2, angle);
          return (
            <line
              key={i}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke="#9c8a6e"
              strokeWidth={isMajor ? 2.5 : 1.5}
            />
          );
        })}
        {minorTicks.map((angle, i) => {
          const inner = pointOnCircle(CX, CY, TRACK_R - 6, angle);
          const outer = pointOnCircle(CX, CY, TRACK_R - 2, angle);
          return (
            <line
              key={i}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke="#9c8a6e"
              strokeWidth={1}
              opacity={0.6}
            />
          );
        })}
        {/* Scale endpoints -- see the endLabels prop doc. Font size/offset
            scale with `size`; the lg dial's fixed 15px crowded the track's
            rounded end-caps once reused on the sm dial's less-than-half radius. */}
        {endLabels && (
          <>
            <text
              x={pointOnCircle(CX, CY, TRACK_R + endLabelOffset, START_ANGLE).x}
              y={pointOnCircle(CX, CY, TRACK_R + endLabelOffset, START_ANGLE).y}
              textAnchor="middle"
              fontSize={endLabelFontSize}
              fontFamily="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
              fill="#9c8a6e"
            >
              {endLabels[0]}
            </text>
            <text
              x={pointOnCircle(CX, CY, TRACK_R + endLabelOffset, START_ANGLE + SWEEP).x}
              y={pointOnCircle(CX, CY, TRACK_R + endLabelOffset, START_ANGLE + SWEEP).y}
              textAnchor="middle"
              fontSize={endLabelFontSize}
              fontFamily="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
              fill="#9c8a6e"
            >
              {endLabels[1]}
            </text>
          </>
        )}
        {/* Needle -- rotated via transform, eased, around the dial center.
            This is the "moving gauge." A tapered polygon rather than a
            uniform-width line, with a thin off-center highlight suggesting a
            machined ridge rather than flat vector art. */}
        <g
          style={{
            transform: `rotate(${needleAngle}deg)`,
            transformOrigin: `${CX}px ${CY}px`,
            transition: reducedMotion ? "none" : "transform 700ms cubic-bezier(0.4, 0, 0.2, 1)",
            filter: glow ? `drop-shadow(0 0 ${glow}px ${color})` : undefined,
          }}
        >
          <polygon
            points={`${CX - NEEDLE_BASE_HALF_WIDTH},${NEEDLE_BASE_Y} ${CX - NEEDLE_TIP_HALF_WIDTH},${NEEDLE_TIP_Y} ${CX + NEEDLE_TIP_HALF_WIDTH},${NEEDLE_TIP_Y} ${CX + NEEDLE_BASE_HALF_WIDTH},${NEEDLE_BASE_Y}`}
            fill={color}
          />
          <line
            x1={CX - 0.6}
            y1={NEEDLE_BASE_Y - 1}
            x2={CX - 0.2}
            y2={NEEDLE_TIP_Y + 1}
            stroke="#ffffff"
            strokeOpacity={0.3}
            strokeWidth={0.7}
            strokeLinecap="round"
          />
        </g>
        {/* Hub -- layered rather than a flat filled dot: a base disc, a dark
            inset ring standing in for a bezel edge, and a small off-center
            highlight standing in for a glossy dome. Cheap to render, doesn't
            need per-state gradient defs since only the base disc carries the
            state color. */}
        <circle cx={CX} cy={CY} r={7} fill={color} style={glow ? { filter: `drop-shadow(0 0 ${glow}px ${color})` } : undefined} />
        <circle cx={CX} cy={CY} r={7} fill="none" stroke="#000000" strokeOpacity={0.4} strokeWidth={1} />
        <circle cx={CX - 1.8} cy={CY - 1.8} r={2} fill="#ffffff" fillOpacity={0.4} />
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
