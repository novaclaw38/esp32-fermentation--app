import { ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import type { ReadingWithGravity } from "../types/database";
import { formatSg } from "../lib/gravity";
import { useTempUnit } from "../lib/tempUnitContext";
import { celsiusToUnit } from "../lib/units";
import { chartTheme } from "../lib/tokens";
import { formatAxisTime, withGaps } from "../lib/chartTime";

interface Props {
  readings: ReadingWithGravity[];
}

/**
 * SG and temperature on one chart, each on its own axis. Split into two
 * axes rather than crammed onto one: they don't share a unit or a
 * meaningful common scale, and forcing that reads as noise rather than
 * signal. A third series -- fermentation velocity -- gets its own chart
 * below (FermentationRateChart) rather than a third axis here, for the
 * same reason: three independently-scaled lines on one plot stops being
 * legible well before it stops being technically possible.
 */
export default function FermentationChart({ readings }: Props) {
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

  return (
    <div className="h-72 rounded-lg border border-panel-700 bg-panel-900 p-4">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={formatAxisTime}
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
            domain={["auto", "auto"]}
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
  );
}
