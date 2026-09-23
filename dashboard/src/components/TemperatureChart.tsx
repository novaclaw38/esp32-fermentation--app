import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from "recharts";
import type { Reading } from "../types/database";
import { useTempUnit } from "../lib/tempUnitContext";
import { celsiusToUnit } from "../lib/units";
import { chartTheme } from "../lib/tokens";
import { formatAxisTime, withGaps } from "../lib/chartTime";

interface Props {
  readings: Reading[];
  tempMinC: number;
  tempMaxC: number;
}

export default function TemperatureChart({ readings, tempMinC, tempMaxC }: Props) {
  const { unit } = useTempUnit();

  // Storage and the thresholds passed in are always °C -- converted only for
  // what's actually drawn, same split as lib/units.ts.
  const points = readings
    .map((r) => ({ t: new Date(r.created_at).getTime(), temperature: celsiusToUnit(r.temperature_c, unit) as number | null }))
    .sort((a, b) => a.t - b.t);
  const data = withGaps(points, (t) => ({ t, temperature: null }));

  const displayMin = celsiusToUnit(tempMinC, unit);
  const displayMax = celsiusToUnit(tempMaxC, unit);

  if (points.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-panel-700 bg-panel-900 px-6 text-center text-panel-400">
        No readings yet — the device will appear here after its first wake cycle.
      </div>
    );
  }

  return (
    <div className="h-64 rounded-lg border border-panel-700 bg-panel-900 p-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
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
            tick={chartTheme.tick}
            unit={`°${unit}`}
            width={52}
            // Always keep both thresholds in view, so a reading's distance
            // from its limit is visible even when it's nowhere near it.
            domain={[(min: number) => Math.min(min, displayMin) - 1, (max: number) => Math.max(max, displayMax) + 1]}
            // Whole-degree ticks only; with decimals allowed, rounding them
            // for display printed the same label twice ("22°C", "22°C").
            allowDecimals={false}
            tickFormatter={(v: number) => v.toFixed(0)}
            stroke={chartTheme.axis}
          />
          <Tooltip
            labelFormatter={(t: number) => formatAxisTime(t)}
            formatter={(value: number) => [`${value.toFixed(1)}°${unit}`, "Temperature"]}
            {...chartTheme.tooltip}
            itemStyle={{ color: chartTheme.temperature }}
          />
          <ReferenceLine y={displayMin} stroke={chartTheme.threshold} strokeDasharray="4 4" />
          <ReferenceLine y={displayMax} stroke={chartTheme.threshold} strokeDasharray="4 4" />
          <Line
            type="monotone"
            dataKey="temperature"
            stroke={chartTheme.temperature}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
