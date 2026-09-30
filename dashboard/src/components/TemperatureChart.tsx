import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from "recharts";
import type { Reading } from "../types/database";
import { useTempUnit } from "../lib/tempUnitContext";
import { celsiusToUnit } from "../lib/units";
import { chartTheme } from "../lib/tokens";
import { niceTicks } from "../lib/axisTicks";
import { formatAxisTime, formatTickTime, timeTicks, withGaps } from "../lib/chartTime";

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

  const ticks = timeTicks(points[0].t, points[points.length - 1].t);
  // Round, evenly spaced degrees, with both limits and half a degree of air
  // beyond them so a limit line never sits on the axis itself.
  const temps = points.map((p) => p.temperature as number);
  const yTicks = niceTicks(Math.min(...temps, displayMin) - 0.5, Math.max(...temps, displayMax) + 0.5, { minStep: 1 });

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
            ticks={ticks}
            tickFormatter={formatTickTime}
            tick={chartTheme.tick}
            minTickGap={40}
            stroke={chartTheme.axis}
          />
          <YAxis
            tick={chartTheme.tick}
            unit={`°${unit}`}
            width={52}
            // Both limits stay in view, so a reading's distance from its
            // limit is visible even when it's nowhere near it.
            domain={[yTicks[0], yTicks[yTicks.length - 1]]}
            ticks={yTicks}
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
