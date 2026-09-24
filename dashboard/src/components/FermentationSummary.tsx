import type { FermentationAnalytics } from "../lib/fermentationAnalytics";
import { formatSg } from "../lib/gravity";

interface Props {
  analytics: FermentationAnalytics;
}

function StatCard({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-panel-700 bg-panel-900 p-4">
      <p className="text-sm text-panel-400">{label}</p>
      <p className={`mt-1 font-gauge tabular text-2xl font-semibold ${accent ? "text-brew-400" : "text-panel-200"}`}>
        {value}
      </p>
    </div>
  );
}

export default function FermentationSummary({ analytics }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard label="Original gravity" value={formatSg(analytics.originalGravity)} />
      <StatCard label="Current gravity" value={formatSg(analytics.currentGravity)} />
      <StatCard label="ABV" value={`${analytics.abv.toFixed(1)}%`} accent />
      <StatCard label="Attenuation" value={`${analytics.apparentAttenuation.toFixed(0)}%`} />
    </div>
  );
}
