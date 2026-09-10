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

interface Props {
  readings: Reading[];
  tempMinC: number;
  tempMaxC: number;
}

export default function TemperatureChart({ readings, tempMinC, tempMaxC }: Props) {
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
      temperature_c: r.temperature_c,
    }));

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-400">
        No readings yet — the device will appear here after its first wake cycle.
      </div>
    );
  }

  return (
    <div className="h-64 rounded-lg border border-stone-200 bg-white p-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
          <XAxis dataKey="time" tick={{ fontSize: 11 }} minTickGap={40} />
          <YAxis tick={{ fontSize: 11 }} unit="°C" domain={["auto", "auto"]} />
          <Tooltip formatter={(value: number) => [`${value.toFixed(1)}°C`, "Temperature"]} />
          <ReferenceLine y={tempMinC} stroke="#c97f22" strokeDasharray="4 4" />
          <ReferenceLine y={tempMaxC} stroke="#c97f22" strokeDasharray="4 4" />
          <Line
            type="monotone"
            dataKey="temperature_c"
            stroke="#a8631c"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
