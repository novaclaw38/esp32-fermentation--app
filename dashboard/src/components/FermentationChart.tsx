import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { ReadingWithGravity } from "../types/database";
import { formatSg } from "../lib/gravity";
import { useTempUnit } from "../lib/tempUnitContext";
import { celsiusToUnit } from "../lib/units";

interface Props {
  readings: ReadingWithGravity[];
}

function axisLabel(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
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
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  if (points.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-panel-700 bg-panel-900 px-6 text-center text-panel-400">
        No gravity readings yet.
      </div>
    );
  }

  const data = points.map((r) => ({
    time: axisLabel(r.created_at),
    sg: Number(r.gravity_sg),
    temperature: celsiusToUnit(r.temperature_c, unit),
  }));

  const sgValues = data.map((d) => d.sg);
  const sgMin = Math.min(...sgValues);
  const sgMax = Math.max(...sgValues);
  const sgPad = Math.max((sgMax - sgMin) * 0.2, 0.004);

  return (
    <div className="h-72 rounded-lg border border-panel-700 bg-panel-900 p-4">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#262019" />
          <XAxis dataKey="time" tick={{ fontSize: 11, fill: "#9c8a6e" }} minTickGap={40} stroke="#453829" />
          <YAxis
            yAxisId="sg"
            tick={{ fontSize: 11, fill: "#9c8a6e" }}
            width={56}
            domain={[sgMin - sgPad, sgMax + sgPad]}
            tickFormatter={(v: number) => formatSg(v)}
            stroke="#453829"
          />
          <YAxis
            yAxisId="temp"
            orientation="right"
            tick={{ fontSize: 11, fill: "#9c8a6e" }}
            unit={`°${unit}`}
            domain={["auto", "auto"]}
            stroke="#453829"
          />
          <Tooltip
            formatter={(value: number, name: string) => [
              name === "Gravity" ? formatSg(value) : `${value.toFixed(1)}°${unit}`,
              name,
            ]}
            contentStyle={{ background: "#1c1712", border: "1px solid #332a20", borderRadius: 6 }}
            labelStyle={{ color: "#d9cbb0" }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: "#9c8a6e" }} />
          <Line
            yAxisId="sg"
            type="monotone"
            dataKey="sg"
            name="Gravity"
            stroke="#4ade80"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            yAxisId="temp"
            type="monotone"
            dataKey="temperature"
            name="Temperature"
            stroke="#dd9834"
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
