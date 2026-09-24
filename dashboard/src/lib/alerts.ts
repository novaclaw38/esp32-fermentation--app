/** Plain-language name for an alert reason, shared by the alert list and the device tiles. */
export function reasonLabel(reason: string): string {
  if (reason === "below_min") return "Below minimum";
  if (reason === "above_max") return "Above maximum";
  if (reason === "sensor_fault") return "Sensor not reading";
  if (reason === "battery_low") return "Battery low";
  return reason;
}
