import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type { ReadingWithGravity } from "../types/database";
import { formatSg, formatPoints } from "../lib/gravity";

interface Props {
  readings: ReadingWithGravity[];
  /** False until the device has calibration coefficients set. */
  calibrated: boolean;
}

function axisLabel(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function GravityChart({ readings, calibrated }: Props) {
  // Hub rows (and any tilt row the accelerometer read failed on) carry a null
  // tilt; they'd render as gaps, so drop them rather than plot holes.
  const points = readings
    .filter((r) => r.tilt_deg != null)
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  if (points.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-panel-700 bg-panel-900 px-6 text-center text-panel-400">
        No tilt readings yet — the module will appear here after its first wake cycle.
      </div>
    );
  }

  // Uncalibrated: every gravity_sg is null, so a gravity chart would be blank.
  // Raw tilt angle is still a real, useful trend (it falls as fermentation
  // proceeds, just on an arbitrary scale), so plot that and say why.
  const showingTilt = !calibrated;

  const data = points.map((r) => ({
    time: axisLabel(r.created_at),
    value: showingTilt ? Number(r.tilt_deg) : Number(r.gravity_sg),
  }));

  // A tilt device that reported before calibration was entered still has null
  // gravity on those rows even though the device is now calibrated.
  const plotted = data.filter((d) => Number.isFinite(d.value));

  if (plotted.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-panel-700 bg-panel-900 px-6 text-center text-panel-400">
        Tilt readings exist but none have a gravity value yet.
      </div>
    );
  }

  const first = plotted[0].value;
  const latest = plotted[plotted.length - 1].value;
  const delta = latest - first;

  // Show how much the temperature correction actually moved the latest reading,
  // so it's auditable rather than invisible.
  const latestRow = points[points.length - 1];
  const correction =
    latestRow.gravity_sg != null && latestRow.gravity_sg_raw != null
      ? latestRow.gravity_sg - latestRow.gravity_sg_raw
      : null;

  // Pad the domain so a nearly-flat series doesn't render as a jagged line
  // across the full height of the chart, which reads as violent movement when
  // the actual change is a couple of gravity points.
  const values = plotted.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const floor = showingTilt ? 1 : 0.004;
  const pad = Math.max((max - min) * 0.2, floor);

  const unit = showingTilt ? "°" : "";
  const format = (v: number) => (showingTilt ? `${v.toFixed(1)}°` : formatSg(v));

  return (
    <div className="space-y-2">
      {showingTilt && (
        <p className="rounded-md border border-approach-500/40 bg-panel-900 p-3 text-sm text-approach-400">
          <span className="font-medium">Showing raw tilt angle, not gravity.</span> This device has
          no calibration curve yet, so there's no way to convert its tilt angle into a specific
          gravity. The trend below is still real — tilt falls as the wort thins out — but the
          numbers aren't SG. Enter the coefficients under <em>Gravity calibration</em> below and
          this chart switches to SG, for the whole history at once.
        </p>
      )}

      <div className="h-64 rounded-lg border border-panel-700 bg-panel-900 p-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={plotted} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#262019" />
            <XAxis dataKey="time" tick={{ fontSize: 11, fill: "#8a7a63" }} minTickGap={40} stroke="#453829" />
            <YAxis
              tick={{ fontSize: 11, fill: "#8a7a63" }}
              unit={unit}
              width={showingTilt ? 44 : 56}
              domain={[min - pad, max + pad]}
              tickFormatter={(v: number) => (showingTilt ? v.toFixed(0) : formatSg(v))}
              stroke="#453829"
            />
            <Tooltip
              formatter={(value: number) => [format(value), showingTilt ? "Tilt" : "Gravity"]}
              contentStyle={{ background: "#1c1712", border: "1px solid #332a20", borderRadius: 6 }}
              labelStyle={{ color: "#d9cbb0" }}
              itemStyle={{ color: "#4ade80" }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#4ade80"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {!showingTilt && correction != null && (
        <p className="text-xs text-panel-400">
          Latest reading corrected to 20°C: {formatSg(latestRow.gravity_sg_raw as number)} raw →{" "}
          <span className="text-panel-200">{formatSg(latestRow.gravity_sg as number)}</span> (
          {formatPoints(correction)} points at {(latestRow.temperature_c ?? 0).toFixed(1)}°C).
        </p>
      )}

      <p className="text-xs text-panel-400">
        Now {format(latest)} · {delta >= 0 ? "+" : "−"}
        {format(Math.abs(delta))} across the readings shown.{" "}
        {/* Deliberately no ABV or attenuation figure: both need the batch's true
            original gravity, and the first point in a 48h window is not that
            unless the batch happens to be under two days old. Showing one
            anyway would be confidently wrong for every established batch. */}
        <span className="text-panel-600">
          Change is measured over this window only, not from the batch's original gravity.
        </span>
      </p>
    </div>
  );
}
