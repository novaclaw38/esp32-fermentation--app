import { ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine } from "recharts";
import type { ReadingWithGravity } from "../types/database";
import { formatSg } from "../lib/gravity";
import { useTempUnit } from "../lib/tempUnitContext";
import { celsiusToUnit, formatTemp } from "../lib/units";
import { chartTheme } from "../lib/tokens";
import { formatAxisTime, formatTickTime, timeTicks, withGaps } from "../lib/chartTime";

interface Props {
  readings: ReadingWithGravity[];
  /** The device's alert limits, in °C -- drawn on the temperature axis. */
  tempMinC: number;
  tempMaxC: number;
}

/** Below half a gravity point the correction line is noise ("+0.0 points"), so it's left out. */
const MIN_VISIBLE_CORRECTION = 0.0005;

/**
 * SG and temperature on one chart, each on its own axis. Split into two
 * axes rather than crammed onto one: they don't share a unit or a
 * meaningful common scale, and forcing that reads as noise rather than
 * signal. A third series -- fermentation velocity -- gets its own chart
 * below (FermentationRateChart) rather than a third axis here, for the
 * same reason: three independently-scaled lines on one plot stops being
 * legible well before it stops being technically possible.
 */
export default function FermentationChart({ readings, tempMinC, tempMaxC }: Props) {
  const { unit } = useTempUnit();

  const points = readings
    .filter((r) => r.gravity_sg != null)
    .map((r) => ({
      t: new Date(r.created_at).getTime(),
      sg: Number(r.gravity_sg) as number | null,
      temperature: celsiusToUnit(r.temperature_c, unit) as number | null,
    }))
    .sort((a, b) => a.t - b.t);

  if (points.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-lg border border-panel-700 bg-panel-900 px-6 text-center text-panel-400">
        No gravity readings yet.
      </div>
    );
  }

  const sgValues = points.map((d) => d.sg as number);
  const sgMin = Math.min(...sgValues);
  const sgMax = Math.max(...sgValues);
  const sgPad = Math.max((sgMax - sgMin) * 0.2, 0.004);
  const data = withGaps(points, (t) => ({ t, sg: null, temperature: null }));
  const ticks = timeTicks(points[0].t, points[points.length - 1].t);
  const displayMin = celsiusToUnit(tempMinC, unit);
  const displayMax = celsiusToUnit(tempMaxC, unit);

  // Change across the window, and how much the temperature correction moved
  // the latest reading -- kept auditable, as the old gravity-only chart did.
  const first = sgValues[0];
  const last = sgValues[sgValues.length - 1];
  const delta = last - first;
  const withGravity = readings.filter((r) => r.gravity_sg != null);
  const latestRow = withGravity[withGravity.length - 1];
  const correction =
    latestRow?.gravity_sg != null && latestRow.gravity_sg_raw != null
      ? latestRow.gravity_sg - latestRow.gravity_sg_raw
      : null;

  return (
    <div className="space-y-2">
      <div className="h-72 rounded-lg border border-panel-700 bg-panel-900 p-4">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
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
              yAxisId="sg"
              tick={chartTheme.tick}
              width={52}
              domain={[sgMin - sgPad, sgMax + sgPad]}
              tickFormatter={(v: number) => formatSg(v)}
              stroke={chartTheme.axis}
            />
            <YAxis
              yAxisId="temp"
              orientation="right"
              tick={chartTheme.tick}
              unit={`°${unit}`}
              width={48}
              // Keep both limits in view so the distance to them is visible.
              domain={[(min: number) => Math.min(min, displayMin) - 1, (max: number) => Math.max(max, displayMax) + 1]}
              // Whole-degree ticks only; with decimals allowed, rounding them
              // for display printed the same label twice ("22°C", "22°C").
              allowDecimals={false}
              tickFormatter={(v: number) => v.toFixed(0)}
              stroke={chartTheme.axis}
            />
            <Tooltip
              labelFormatter={(t: number) => formatAxisTime(t)}
              formatter={(value: number, name: string) => [
                name === "Gravity" ? formatSg(value) : `${value.toFixed(1)}°${unit}`,
                name,
              ]}
              {...chartTheme.tooltip}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: chartTheme.tick.fill }} />
            <ReferenceLine yAxisId="temp" y={displayMin} stroke={chartTheme.threshold} strokeDasharray="4 4" strokeOpacity={0.7} />
            <ReferenceLine yAxisId="temp" y={displayMax} stroke={chartTheme.threshold} strokeDasharray="4 4" strokeOpacity={0.7} />
            <Line
              yAxisId="sg"
              type="monotone"
              dataKey="sg"
              name="Gravity"
              stroke={chartTheme.gravity}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              yAxisId="temp"
              type="monotone"
              dataKey="temperature"
              name="Temperature"
              stroke={chartTheme.temperature}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <p className="text-xs text-panel-400">
        Gravity {delta <= 0 ? "fell" : "rose"} {(Math.abs(delta) * 1000).toFixed(1)} points in the readings shown
        (this window only, not since the batch started). Dashed red lines are this device's temperature limits.
        {correction != null && Math.abs(correction) >= MIN_VISIBLE_CORRECTION && (
          <>
            {" "}
            The latest reading was corrected to {formatTemp(20, unit, 0)}: {formatSg(latestRow!.gravity_sg_raw as number)}{" "}
            raw, {formatSg(latestRow!.gravity_sg as number)} corrected.
          </>
        )}
      </p>
    </div>
  );
}
