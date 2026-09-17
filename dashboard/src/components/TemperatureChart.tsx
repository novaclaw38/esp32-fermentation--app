import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import type { Reading } from "../types/database";
import { useTempUnit } from "../lib/tempUnitContext";
import { celsiusToUnit } from "../lib/units";

interface Props {
  readings: Reading[];
  tempMinC: number;
  tempMaxC: number;
}

export default function TemperatureChart({ readings, tempMinC, tempMaxC }: Props) {
  const { unit } = useTempUnit();

  // Storage and the thresholds passed in are always °C -- converted only for
  // what's actually drawn, same split as lib/units.ts.
  const data = readings
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((r) => ({
      time: new Date(r.created_at).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      temperature: celsiusToUnit(r.temperature_c, unit),
    }));

  const displayMin = celsiusToUnit(tempMinC, unit);
  const displayMax = celsiusToUnit(tempMaxC, unit);

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-panel-700 bg-panel-900 text-panel-400">
        No readings yet — the device will appear here after its first wake cycle.
      </div>
    );
  }

  return (
    <div className="h-64 rounded-lg border border-panel-700 bg-panel-900 p-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#262019" />
          <XAxis dataKey="time" tick={{ fontSize: 11, fill: "#9c8a6e" }} minTickGap={40} stroke="#453829" />
          <YAxis tick={{ fontSize: 11, fill: "#9c8a6e" }} unit={`°${unit}`} domain={["auto", "auto"]} stroke="#453829" />
          <Tooltip
            formatter={(value: number) => [`${value.toFixed(1)}°${unit}`, "Temperature"]}
            contentStyle={{ background: "#1c1712", border: "1px solid #332a20", borderRadius: 6 }}
            labelStyle={{ color: "#d9cbb0" }}
            itemStyle={{ color: "#dd9834" }}
          />
          <ReferenceLine y={displayMin} stroke="#f87171" strokeDasharray="4 4" />
          <ReferenceLine y={displayMax} stroke="#f87171" strokeDasharray="4 4" />
          <Line
            type="monotone"
            dataKey="temperature"
            stroke="#dd9834"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
