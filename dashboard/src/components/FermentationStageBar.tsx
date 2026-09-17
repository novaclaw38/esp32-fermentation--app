import type { FermentationAnalytics, FermentationStage } from "../lib/fermentationAnalytics";
import type { Device } from "../types/database";

interface Props {
  analytics: FermentationAnalytics;
  device: Device;
  /** Latest reading's temperature, for the Lag-phase cold-ambient caution. */
  latestTempC: number | null;
}

const STAGES: { stage: FermentationStage; label: string }[] = [
  { stage: "LAG", label: "Lag" },
  { stage: "ACTIVE_FERMENTATION", label: "Active" },
  { stage: "SLOWING", label: "Slowing" },
  { stage: "STABILIZATION_CLEANUP", label: "Cleanup" },
  { stage: "COMPLETED", label: "Complete" },
];

const LAG_COLD_THRESHOLD_C = 15;
const LAG_DURATION_CAUTION_H = 36;

function guidance(
  analytics: FermentationAnalytics,
  device: Device,
  latestTempC: number | null,
): { text: string; caution: boolean } {
  const startedAt = device.fermentation_started_at ? new Date(device.fermentation_started_at).getTime() : null;
  const lagHours = startedAt != null ? (Date.now() - startedAt) / (60 * 60 * 1000) : 0;

  switch (analytics.stage) {
    case "LAG": {
      if (latestTempC != null && latestTempC < LAG_COLD_THRESHOLD_C) {
        return { text: `No visible activity yet, and it's running cold (${latestTempC.toFixed(1)}°C) — yeast is sluggish below ${LAG_COLD_THRESHOLD_C}°C.`, caution: true };
      }
      if (lagHours > LAG_DURATION_CAUTION_H) {
        return { text: `Still in lag after ${lagHours.toFixed(0)}h with no visible drop — worth checking the pitch if this continues.`, caution: true };
      }
      return { text: "Yeast hasn't visibly started yet — normal for the first several hours after pitching.", caution: false };
    }
    case "ACTIVE_FERMENTATION":
      return { text: "Actively fermenting.", caution: false };
    case "SLOWING":
      return { text: "Fermentation is slowing. Consider a diacetyl rest — raise the temperature 1.5–2°C for a couple of days before packaging.", caution: false };
    case "STABILIZATION_CLEANUP":
      return {
        text: analytics.hasFullPlateauWindow
          ? "Gravity has mostly stopped but hasn't held flat long enough to call it done — yeast is likely still cleaning up off-flavors."
          : "Gravity is barely moving. Give it more time before confirming it's finished.",
        caution: false,
      };
    case "COMPLETED":
      return { text: "Fermentation complete — ready for bottling or a cold crash.", caution: false };
  }
}

export default function FermentationStageBar({ analytics, device, latestTempC }: Props) {
  const activeIndex = STAGES.findIndex((s) => s.stage === analytics.stage);
  const { text, caution } = guidance(analytics, device, latestTempC);

  return (
    <div className="rounded-lg border border-panel-700 bg-panel-900 p-4">
      <div className="flex items-center">
        {STAGES.map((s, i) => {
          const isActive = i === activeIndex;
          const isPast = i < activeIndex;
          return (
            <div key={s.stage} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`h-2.5 w-2.5 rounded-full ${
                    isActive
                      ? "bg-brew-400"
                      : isPast
                        ? "bg-panel-400"
                        : "bg-panel-700"
                  }`}
                  style={isActive ? { filter: "drop-shadow(0 0 4px #dd9834)" } : undefined}
                />
                <span
                  className={`text-[10px] font-medium uppercase tracking-widest ${
                    isActive ? "text-brew-400" : isPast ? "text-panel-400" : "text-panel-700"
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {i < STAGES.length - 1 && (
                <div className={`mx-1 h-px flex-1 ${isPast ? "bg-panel-400" : "bg-panel-700"}`} />
              )}
            </div>
          );
        })}
      </div>

      <p className={`mt-4 text-sm ${caution ? "text-approach-400" : "text-panel-400"}`}>{text}</p>
    </div>
  );
}
