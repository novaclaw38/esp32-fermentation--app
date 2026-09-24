import type { FermentationAnalytics, FermentationStage } from "../lib/fermentationAnalytics";
import type { Device } from "../types/database";
import { useTempUnit } from "../lib/tempUnitContext";
import { formatTemp, type TempUnit } from "../lib/units";
import { palette } from "../lib/tokens";

interface Props {
  analytics: FermentationAnalytics;
  device: Device;
  /** Latest reading's temperature, for the Lag-phase cold-ambient caution. */
  latestTempC: number | null;
  /** The page's ticking clock, so "still in lag after 40h" keeps counting while the page is open. */
  now: Date;
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

/** A temperature *difference* in the viewer's unit -- no +32 offset. */
function formatDelta(deltaC: [number, number], unit: TempUnit): string {
  const scale = unit === "F" ? 9 / 5 : 1;
  return `${(deltaC[0] * scale).toFixed(1)}–${(deltaC[1] * scale).toFixed(1)}°${unit}`;
}

function guidance(
  analytics: FermentationAnalytics,
  device: Device,
  latestTempC: number | null,
  now: Date,
  unit: TempUnit,
): { text: string; caution: boolean } {
  const startedAt = device.fermentation_started_at ? new Date(device.fermentation_started_at).getTime() : null;
  const lagHours = startedAt != null ? (now.getTime() - startedAt) / (60 * 60 * 1000) : 0;

  switch (analytics.stage) {
    case "LAG": {
      if (latestTempC != null && latestTempC < LAG_COLD_THRESHOLD_C) {
        return {
          text: `No visible activity yet, and it's running cold (${formatTemp(latestTempC, unit)}) — yeast is sluggish below ${formatTemp(LAG_COLD_THRESHOLD_C, unit, 0)}.`,
          caution: true,
        };
      }
      if (lagHours > LAG_DURATION_CAUTION_H) {
        return { text: `Still in lag after ${lagHours.toFixed(0)}h with no visible drop — worth checking the pitch if this continues.`, caution: true };
      }
      return { text: "Yeast hasn't visibly started yet — normal for the first several hours after pitching.", caution: false };
    }
    case "ACTIVE_FERMENTATION":
      return { text: "Actively fermenting.", caution: false };
    case "SLOWING":
      return {
        text: `Fermentation is slowing. Consider a diacetyl rest — raise the temperature ${formatDelta([1.5, 2], unit)} for a couple of days before packaging.`,
        caution: false,
      };
    case "STABILIZATION_CLEANUP":
      return {
        text: analytics.hasFullPlateauWindow
          ? "Gravity has mostly stopped but hasn't held flat long enough to call it done — yeast is likely still cleaning up off-flavors."
          : "Gravity is barely moving. Give it more time before confirming it's finished.",
        caution: false,
      };
    case "COMPLETED":
      return { text: "Fermentation complete — gravity has held steady for 48 hours. Ready for bottling or a cold crash.", caution: false };
  }
}

export default function FermentationStageBar({ analytics, device, latestTempC, now }: Props) {
  const { unit } = useTempUnit();
  const activeIndex = STAGES.findIndex((s) => s.stage === analytics.stage);
  const { text, caution } = guidance(analytics, device, latestTempC, now, unit);

  return (
    <div className="rounded-lg border border-panel-700 bg-panel-900 p-4">
      <ol aria-label="Fermentation stage" className="flex items-center">
        {STAGES.map((s, i) => {
          const isActive = i === activeIndex;
          const isPast = i < activeIndex;
          return (
            <li
              key={s.stage}
              aria-current={isActive ? "step" : undefined}
              className="flex flex-1 items-center last:flex-none"
            >
              <div className="flex flex-col items-center gap-1.5">
                <div
                  aria-hidden="true"
                  className={`h-2.5 w-2.5 rounded-full ${
                    isActive ? "bg-brew-400" : isPast ? "bg-panel-400" : "border border-panel-500 bg-transparent"
                  }`}
                  style={isActive ? { filter: `drop-shadow(0 0 4px ${palette.brew[400]})` } : undefined}
                />
                {/* Upcoming stages were panel-700 text (1.26:1 -- effectively
                    invisible). They stay quieter than past/current through
                    weight and a hollow dot, not through failing contrast. */}
                <span
                  className={`text-xs ${
                    isActive ? "font-semibold text-brew-400" : isPast ? "font-medium text-panel-200" : "font-normal text-panel-400"
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {i < STAGES.length - 1 && (
                <div aria-hidden="true" className={`mx-1 h-px flex-1 ${isPast ? "bg-panel-400" : "bg-panel-700"}`} />
              )}
            </li>
          );
        })}
      </ol>

      <p className={`mt-4 text-sm ${caution ? "text-approach-400" : "text-panel-400"}`}>{text}</p>
    </div>
  );
}
