/**
 * Leak Sniffer protocol and signal logic -- the pure half of the Sniffer page,
 * kept free of React and Web Bluetooth so it can be unit-tested.
 *
 * The BLE layout mirrors leak-sniffer/firmware/leak_sniffer_v1 byte for byte;
 * change both together.
 */

export const SNIFFER_SERVICE_UUID = "7a1e0001-3c4b-4f0e-9a51-6c2d8e4b5f10";
export const SNIFFER_READING_UUID = "7a1e0002-3c4b-4f0e-9a51-6c2d8e4b5f10";
export const SNIFFER_CONTROL_UUID = "7a1e0003-3c4b-4f0e-9a51-6c2d8e4b5f10";
export const SNIFFER_NAME_PREFIX = "LeakSniffer-";

/** Bytes in one READING notification. Sized to fit the default ATT MTU. */
export const READING_LENGTH = 20;

export type SensorState = "warming" | "ready" | "fault";

export interface SnifferReading {
  seq: number;
  rsOhm: number | null;
  /** Clean-air baseline. Null until the sniffer has been zeroed. */
  r0Ohm: number | null;
  /** Only when the sniffer has been calibrated against a reference gas. */
  ppm: number | null;
  tempC: number | null;
  rhPct: number | null;
  vbatV: number | null;
  state: SensorState;
  pumpOn: boolean;
  onUsbPower: boolean;
  /** The operator pressed the sniffer's button: record a point here. */
  markPressed: boolean;
}

const STATES: SensorState[] = ["warming", "ready", "fault"];

function finiteOrNull(n: number): number | null {
  return Number.isFinite(n) ? n : null;
}

export function parseReading(view: DataView): SnifferReading {
  if (view.byteLength < READING_LENGTH) {
    throw new Error(`Sniffer reading too short: ${view.byteLength} bytes, expected ${READING_LENGTH}`);
  }
  const rs = view.getFloat32(2, true);
  const r0 = view.getFloat32(6, true);
  const ppm = view.getUint16(10, true);
  const t = view.getInt16(12, true);
  const rh = view.getUint16(14, true);
  const vbat = view.getUint16(16, true);
  const flags = view.getUint8(19);
  return {
    seq: view.getUint16(0, true),
    rsOhm: finiteOrNull(rs) != null && rs > 0 ? rs : null,
    r0Ohm: finiteOrNull(r0) != null && r0 > 0 ? r0 : null,
    ppm: ppm === 0xffff ? null : ppm,
    tempC: t === -32768 ? null : t / 100,
    rhPct: rh === 0xffff ? null : rh / 100,
    vbatV: vbat === 0 ? null : vbat / 1000,
    state: STATES[view.getUint8(18)] ?? "fault",
    pumpOn: (flags & 0x01) !== 0,
    onUsbPower: (flags & 0x02) !== 0,
    markPressed: (flags & 0x04) !== 0,
  };
}

/** Inverse of parseReading -- used by the demo sniffer and the tests. */
export function encodeReading(r: SnifferReading): DataView {
  const view = new DataView(new ArrayBuffer(READING_LENGTH));
  view.setUint16(0, r.seq & 0xffff, true);
  view.setFloat32(2, r.rsOhm ?? NaN, true);
  view.setFloat32(6, r.r0Ohm ?? NaN, true);
  view.setUint16(10, r.ppm == null ? 0xffff : Math.min(65534, Math.max(0, Math.round(r.ppm))), true);
  view.setInt16(12, r.tempC == null ? -32768 : Math.round(r.tempC * 100), true);
  view.setUint16(14, r.rhPct == null ? 0xffff : Math.round(r.rhPct * 100), true);
  view.setUint16(16, r.vbatV == null ? 0 : Math.round(r.vbatV * 1000), true);
  view.setUint8(18, Math.max(0, STATES.indexOf(r.state)));
  view.setUint8(19, (r.pumpOn ? 0x01 : 0) | (r.onUsbPower ? 0x02 : 0) | (r.markPressed ? 0x04 : 0));
  return view;
}

export type SnifferCommand =
  | { type: "zero" }
  | { type: "pump"; duty: number }
  | { type: "buzzer"; on: boolean }
  | { type: "calibrate100ppm" };

export function encodeCommand(cmd: SnifferCommand): Uint8Array<ArrayBuffer> {
  switch (cmd.type) {
    case "zero":
      return Uint8Array.of(0x01);
    case "pump":
      return Uint8Array.of(0x02, Math.min(255, Math.max(0, Math.round(cmd.duty))));
    case "buzzer":
      return Uint8Array.of(0x03, cmd.on ? 1 : 0);
    case "calibrate100ppm":
      return Uint8Array.of(0x04);
  }
}

/**
 * R0/Rs. The TGS2616's resistance falls as hydrogen rises, so this reads 1.0
 * in clean air and climbs toward the leak. Null until there's a baseline.
 */
export function responseOf(r: Pick<SnifferReading, "rsOhm" | "r0Ohm">): number | null {
  if (r.rsOhm == null || r.r0Ohm == null) return null;
  return r.r0Ohm / r.rsOhm;
}

/**
 * Response bands. Deliberately relative: pinpointing is about finding the
 * peak, and a MOS sensor's absolute reading drifts with humidity and age.
 * TRACE is a little above the ~5% wander a warmed-up sensor shows in still
 * clean air; STRONG is where a real source is almost certainly close.
 */
export const RESPONSE_TRACE = 1.15;
export const RESPONSE_STRONG = 1.5;
/** Dial full scale. A leak straight under the probe easily pins it. */
export const RESPONSE_GAUGE_MAX = 5;

export type ResponseBand = "clean" | "trace" | "strong";

export function responseBand(response: number): ResponseBand {
  if (response >= RESPONSE_STRONG) return "strong";
  if (response >= RESPONSE_TRACE) return "trace";
  return "clean";
}

/**
 * Geiger-style click timing for the web app's audio: silent in clean air,
 * then faster and higher-pitched as the response climbs. Matches the
 * sniffer's own buzzer so the two sound alike.
 */
export function clickTiming(response: number | null): { intervalMs: number; frequencyHz: number } | null {
  if (response == null || response < 1.05) return null;
  const strength = Math.min(1, Math.max(0, (response - 1) / 3));
  return {
    intervalMs: Math.round(600 - strength * 560),
    frequencyHz: Math.round(1800 + strength * 1200),
  };
}

/**
 * Demo sniffer: a probe swept along a line with a leak buried at LEAK_AT.
 * Gaussian plume over a slightly noisy clean-air baseline -- enough to try
 * the whole page, sound and survey flow with no hardware.
 */
export const DEMO_LEAK_AT = 62;
const DEMO_R0 = 42_000;

export function demoReading(position: number, seq: number, noise = Math.random): SnifferReading {
  const plume = 3.2 * Math.exp(-(((position - DEMO_LEAK_AT) / 7) ** 2));
  const wander = (noise() - 0.5) * 0.04;
  const response = 1 + plume + wander;
  return {
    seq,
    rsOhm: DEMO_R0 / response,
    r0Ohm: DEMO_R0,
    ppm: null,
    tempC: 18.4,
    rhPct: 61,
    vbatV: 3.92,
    state: "ready",
    pumpOn: true,
    onUsbPower: false,
    markPressed: false,
  };
}

export interface MarkedPoint {
  /** Database id once saved; null for demo points or a failed save. */
  id: number | null;
  /** Stable client-side key, including for points that never saved. */
  key: string;
  label: string;
  response: number;
  ppm: number | null;
  rsOhm: number | null;
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  tempC: number | null;
  rhPct: number | null;
  suspectedLeak: boolean;
  createdAt: string;
  saveError: string | null;
}

/** The point with the highest response -- where to dig first. */
export function peakPoint<T extends { response: number }>(points: T[]): T | null {
  return points.reduce<T | null>((best, p) => (best == null || p.response > best.response ? p : best), null);
}
