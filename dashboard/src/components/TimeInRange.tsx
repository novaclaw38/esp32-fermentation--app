import type { TimeInRange } from "../lib/timeInRange";
import { formatDateTime } from "../lib/chartTime";
import { formatTemp, type TempUnit } from "../lib/units";

const HOUR_MS = 3_600_000;

/** "41", or "6.5" when the number is small enough that a decimal matters. */
function hours(ms: number): string {
  const h = ms / HOUR_MS;
  return h >= 10 ? String(Math.round(h)) : h.toFixed(1);
}

interface Props {
  result: TimeInRange;
  minC: number;
  maxC: number;
  unit: TempUnit;
}

/**
 * The written counterpart to the gauge: how long the ferment stayed inside its
 * own limits, and when it last left them. Computed from the readings on file,
 * never estimated -- time with no reading is reported as missing, not counted
 * as in range.
 */
export default function TimeInRangeSummary({ result, minC, maxC, unit }: Props) {
  const { totalMs, inRangeMs, missingMs, lastOutAt, outNow } = result;

  const sentence = outNow
    ? "Outside its range now."
    : lastOutAt != null
      ? `Last outside its range ${formatDateTime(lastOutAt)}.`
      : "Has not left its range.";

  return (
    <div className="min-w-[14rem] flex-1">
      <p className="text-sm text-panel-400">
        Last {hours(totalMs)} hours, {formatTemp(minC, unit)} to {formatTemp(maxC, unit)}
      </p>
      <p className="mt-1 text-sm text-panel-400">
        <span className="font-gauge tabular text-2xl font-semibold text-panel-200">{hours(inRangeMs)}</span> hours in
        range
      </p>
      <p className="mt-2 text-sm text-panel-400">{sentence}</p>
      {missingMs >= HOUR_MS && (
        <p className="mt-1 text-sm text-panel-400">No readings for {hours(missingMs)} of those hours.</p>
      )}
    </div>
  );
}
