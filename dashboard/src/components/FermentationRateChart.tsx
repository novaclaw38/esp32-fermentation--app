import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from "recharts";
import type { ReadingWithGravity } from "../types/database";
import { computeFermentationRateSeries } from "../lib/fermentationAnalytics";
import { formatPoints } from "../lib/gravity";

interface Props {
  readings: ReadingWithGravity[];
}

function axisLabel(t: number): string {
  return new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Fermentation velocity -- SG drop per 24h -- to visualize the activity peak and its decay, not just the two current headline numbers. */
export default function FermentationRateChart({ readings }: Props) {
  const series = computeFermentationRateSeries(readings);

  if (series.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-panel-700 bg-panel-900 px-6 text-center text-panel-400">
        Not enough history yet to chart a rate.
      </div>
    );
  }

  const data = series.map((p) => ({ time: axisLabel(p.t), rate: p.ratePer24h }));
  const values = data.map((d) => d.rate);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const pad = Math.max((max - min) * 0.2, 0.0005);

  return (
    <div className="h-40 rounded-lg border border-panel-700 bg-panel-900 p-4">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#262019" />
          <XAxis dataKey="time" tick={{ fontSize: 11, fill: "#9c8a6e" }} minTickGap={40} stroke="#453829" />
          <YAxis
            tick={{ fontSize: 11, fill: "#9c8a6e" }}
            width={56}
            domain={[min - pad, max + pad]}
            tickFormatter={(v: number) => formatPoints(v)}
            stroke="#453829"
          />
          <Tooltip
            formatter={(value: number) => [`${formatPoints(value)} SG/24h`, "Rate"]}
            contentStyle={{ background: "#1c1712", border: "1px solid #332a20", borderRadius: 6 }}
            labelStyle={{ color: "#d9cbb0" }}
          />
          <ReferenceLine y={0} stroke="#453829" />
          <Area
            type="monotone"
            dataKey="rate"
            stroke="#4ade80"
            fill="#4ade80"
            fillOpacity={0.15}
            strokeWidth={2}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
