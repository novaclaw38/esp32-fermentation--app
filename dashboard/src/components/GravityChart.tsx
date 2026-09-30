import { Link } from "react-router-dom";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import type { ReadingWithGravity } from "../types/database";
import { formatSg, formatPoints } from "../lib/gravity";
import { useTempUnit } from "../lib/tempUnitContext";
import { formatTemp } from "../lib/units";
import { chartTheme } from "../lib/tokens";
import { niceTicks } from "../lib/axisTicks";
import { formatAxisTime, formatTickTime, timeTicks, withGaps } from "../lib/chartTime";

interface Props {
  readings: ReadingWithGravity[];
  /** False until the device has calibration coefficients set. */
  calibrated: boolean;
  deviceId: string;
}

export default function GravityChart({ readings, calibrated, deviceId }: Props) {
  const { unit: tempUnit } = useTempUnit();

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

  // A tilt device that reported before calibration was entered still has null
  // gravity on those rows even though the device is now calibrated.
  const plotted = points
    .map((r) => ({
      t: new Date(r.created_at).getTime(),
      value: showingTilt ? Number(r.tilt_deg) : r.gravity_sg == null ? NaN : Number(r.gravity_sg),
    }))
    .filter((d) => Number.isFinite(d.value)) as { t: number; value: number | null }[];

  if (plotted.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-panel-700 bg-panel-900 px-6 text-center text-panel-400">
        Tilt readings exist but none have a gravity value yet.
      </div>
    );
  }

  const first = plotted[0].value as number;
  const latest = plotted[plotted.length - 1].value as number;
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
  const values = plotted.map((d) => d.value as number);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const floor = showingTilt ? 1 : 0.004;
  const pad = Math.max((max - min) * 0.2, floor);

  const unit = showingTilt ? "°" : "";
  const format = (v: number) => (showingTilt ? `${v.toFixed(1)}°` : formatSg(v));
  const data = withGaps(plotted, (t) => ({ t, value: null }));
  const ticks = timeTicks(plotted[0].t, plotted[plotted.length - 1].t);
  const yTicks = niceTicks(min - pad, max + pad, { minStep: showingTilt ? 1 : 0.005 });

  return (
    <div className="space-y-2">
      {showingTilt && (
        <p className="rounded-md border border-approach-500/40 bg-panel-900 p-3 text-sm text-approach-400">
          <span className="font-medium">Showing raw tilt angle, not gravity.</span> This device has
          no calibration curve yet, so there's no way to convert its tilt angle into a specific
          gravity. The trend below is still real — tilt falls as the wort thins out — but the
          numbers aren't SG.{" "}
          <Link to={`/devices/${deviceId}/settings?tab=setup`} className="font-medium underline">
            Enter the calibration coefficients
          </Link>{" "}
          and this chart switches to SG, for the whole history at once.
        </p>
      )}

      <div className="h-64 rounded-lg border border-panel-700 bg-panel-900 p-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              ticks={ticks}
              tickFormatter={formatTickTime}
              tick={chartTheme.tick}
              minTickGap={40}
              stroke={chartTheme.axis}
            />
            <YAxis
              tick={chartTheme.tick}
              unit={unit}
              width={showingTilt ? 44 : 56}
              domain={[yTicks[0], yTicks[yTicks.length - 1]]}
              ticks={yTicks}
              tickFormatter={(v: number) => (showingTilt ? v.toFixed(0) : formatSg(v))}
              stroke={chartTheme.axis}
            />
            <Tooltip
              labelFormatter={(t: number) => formatAxisTime(t)}
              formatter={(value: number) => [format(value), showingTilt ? "Tilt" : "Gravity"]}
              {...chartTheme.tooltip}
              itemStyle={{ color: chartTheme.gravity }}
            />
            <Line type="monotone" dataKey="value" stroke={chartTheme.gravity} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {!showingTilt && correction != null && (
        <p className="text-xs text-panel-400">
          Latest reading corrected to {formatTemp(20, tempUnit, 0)}: {formatSg(latestRow.gravity_sg_raw as number)} raw →{" "}
          <span className="text-panel-200">{formatSg(latestRow.gravity_sg as number)}</span> (
          {formatPoints(correction)} points at {formatTemp(latestRow.temperature_c, tempUnit)}).
        </p>
      )}

      <p className="text-xs text-panel-400">
        Now {format(latest)}, {delta >= 0 ? "up" : "down"} {format(Math.abs(delta))} across the readings shown.{" "}
        {/* No ABV/attenuation figure here on purpose: those are measured from
            the batch's true original gravity (see the Fermentation section
            above), not from the first point in whatever window this chart
            happens to be showing -- this line stays scoped to the window. */}
        Change is measured over this window only, not from the batch's original gravity.
      </p>
    </div>
  );
}
