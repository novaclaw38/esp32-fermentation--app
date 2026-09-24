import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine } from "recharts";
import type { TracePoint } from "../lib/useSniffer";
import { RESPONSE_STRONG, RESPONSE_TRACE } from "../lib/sniffer";
import { chartTheme, palette } from "../lib/tokens";

interface Props {
  trace: TracePoint[];
}

/** The last minute of response, newest on the right -- where the sweep peaked. */
export default function SnifferTrace({ trace }: Props) {
  const now = trace.length > 0 ? trace[trace.length - 1].t : 0;
  const data = trace.map((p) => ({ s: (p.t - now) / 1000, response: p.response }));
  const peak = trace.reduce((m, p) => (p.response != null && p.response > m ? p.response : m), 1);

  return (
    <div className="h-48 rounded-lg border border-panel-700 bg-panel-900 p-4" aria-label="Response over the last minute" role="img">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 12, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
          <XAxis
            dataKey="s"
            type="number"
            domain={[-60, 0]}
            ticks={[-60, -45, -30, -15, 0]}
            tickFormatter={(s: number) => (s === 0 ? "now" : `${s}s`)}
            tick={chartTheme.tick}
            stroke={chartTheme.axis}
          />
          <YAxis
            domain={[0.8, Math.max(2, Math.ceil(peak))]}
            tickFormatter={(v: number) => `${v.toFixed(1)}×`}
            tick={chartTheme.tick}
            stroke={chartTheme.axis}
            width={48}
          />
          <ReferenceLine y={RESPONSE_TRACE} stroke={palette.approach[400]} strokeDasharray="4 4" />
          <ReferenceLine y={RESPONSE_STRONG} stroke={palette.breach[400]} strokeDasharray="4 4" />
          <Line
            type="monotone"
            dataKey="response"
            stroke={chartTheme.temperature}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
