import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from "recharts";
import type { ReadingWithGravity } from "../types/database";
import { computeFermentationRateSeries } from "../lib/fermentationAnalytics";
import { formatPoints } from "../lib/gravity";
import { chartTheme } from "../lib/tokens";
import { formatAxisTime, withGaps } from "../lib/chartTime";

interface Props {
  /** The full analytics history -- the rate at each point looks back up to 24h, so it needs more than the chart shows. */
  readings: ReadingWithGravity[];
  batchStartedAt: string | null;
  /** Epoch ms; only rate points from here on are drawn. */
  since: number;
}

/**
 * Fermentation velocity -- SG drop per 24h, in gravity points (1 point =
 * 0.001 SG), the unit brewers actually talk in -- to visualize the activity
 * peak and its decay, not just the two current headline numbers.
 */
export default function FermentationRateChart({ readings, batchStartedAt, since }: Props) {
  const series = computeFermentationRateSeries(readings, batchStartedAt).filter((p) => p.t >= since);

  if (series.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-panel-700 bg-panel-900 px-6 text-center text-panel-400">
        Not enough history yet to chart a rate.
      </div>
    );
  }

  const points = series.map((p) => ({ t: p.t, rate: p.ratePer24h as number | null }));
  const values = series.map((p) => p.ratePer24h);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const pad = Math.max((max - min) * 0.2, 0.0005);
  const data = withGaps(points, (t) => ({ t, rate: null }));

  return (
    <div className="h-40 rounded-lg border border-panel-700 bg-panel-900 p-4">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
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
            width={52}
            domain={[min - pad, max + pad]}
            tickFormatter={(v: number) => formatPoints(v)}
            stroke={chartTheme.axis}
          />
          <Tooltip
            labelFormatter={(t: number) => formatAxisTime(t)}
            formatter={(value: number) => [`${formatPoints(value)} points / 24h`, "Rate"]}
            {...chartTheme.tooltip}
          />
          <ReferenceLine y={0} stroke={chartTheme.axis} />
          <Area
            type="monotone"
            dataKey="rate"
            stroke={chartTheme.gravity}
            fill={chartTheme.gravity}
            fillOpacity={0.15}
            strokeWidth={2}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
