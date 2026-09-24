import { describe, expect, it } from "vitest";
import {
  READING_LENGTH,
  clickTiming,
  demoReading,
  encodeCommand,
  encodeReading,
  parseReading,
  peakPoint,
  responseBand,
  responseOf,
  type SnifferReading,
} from "../sniffer";

describe("parseReading", () => {
  it("decodes the firmware's 20-byte little-endian layout", () => {
    // Built by hand at the firmware's offsets, not with encodeReading, so a
    // matching mistake in both halves can't hide a layout bug.
    const view = new DataView(new ArrayBuffer(20));
    view.setUint16(0, 513, true);
    view.setFloat32(2, 12_000, true);
    view.setFloat32(6, 36_000, true);
    view.setUint16(10, 0xffff, true);
    view.setInt16(12, 1875, true);
    view.setUint16(14, 6230, true);
    view.setUint16(16, 3912, true);
    view.setUint8(18, 1);
    view.setUint8(19, 0b101);

    const r = parseReading(view);
    expect(r.seq).toBe(513);
    expect(r.rsOhm).toBe(12_000);
    expect(r.r0Ohm).toBe(36_000);
    expect(r.ppm).toBeNull();
    expect(r.tempC).toBeCloseTo(18.75);
    expect(r.rhPct).toBeCloseTo(62.3);
    expect(r.vbatV).toBeCloseTo(3.912);
    expect(r.state).toBe("ready");
    expect(r.pumpOn).toBe(true);
    expect(r.onUsbPower).toBe(false);
    expect(r.markPressed).toBe(true);
    expect(responseOf(r)).toBeCloseTo(3);
  });

  it("maps the firmware's 'no value' sentinels to null", () => {
    const view = new DataView(new ArrayBuffer(20));
    view.setFloat32(2, NaN, true);
    view.setFloat32(6, NaN, true);
    view.setUint16(10, 0xffff, true);
    view.setInt16(12, -32768, true);
    view.setUint16(14, 0xffff, true);
    view.setUint8(18, 0);
    const r = parseReading(view);
    expect(r).toMatchObject({ rsOhm: null, r0Ohm: null, ppm: null, tempC: null, rhPct: null, vbatV: null, state: "warming" });
    expect(responseOf(r)).toBeNull();
  });

  it("treats an unknown state byte as a fault rather than guessing", () => {
    const view = new DataView(new ArrayBuffer(20));
    view.setUint8(18, 9);
    expect(parseReading(view).state).toBe("fault");
  });

  it("rejects a truncated notification", () => {
    expect(() => parseReading(new DataView(new ArrayBuffer(16)))).toThrow(/too short/);
  });

  it("round-trips through encodeReading", () => {
    const original: SnifferReading = {
      seq: 7, rsOhm: 5000, r0Ohm: 20_000, ppm: 240, tempC: -3.5, rhPct: 88.5, vbatV: 3.7,
      state: "ready", pumpOn: false, onUsbPower: true, markPressed: false,
    };
    const view = encodeReading(original);
    expect(view.byteLength).toBe(READING_LENGTH);
    expect(parseReading(view)).toEqual(original);
  });
});

describe("encodeCommand", () => {
  it("matches the firmware's opcodes", () => {
    expect([...encodeCommand({ type: "zero" })]).toEqual([0x01]);
    expect([...encodeCommand({ type: "pump", duty: 180 })]).toEqual([0x02, 180]);
    expect([...encodeCommand({ type: "pump", duty: 999 })]).toEqual([0x02, 255]);
    expect([...encodeCommand({ type: "buzzer", on: false })]).toEqual([0x03, 0]);
    expect([...encodeCommand({ type: "calibrate100ppm" })]).toEqual([0x04]);
  });
});

describe("response bands and clicks", () => {
  it("bands by relative response", () => {
    expect(responseBand(1.0)).toBe("clean");
    expect(responseBand(1.2)).toBe("trace");
    expect(responseBand(2.5)).toBe("strong");
  });

  it("is silent in clean air and clicks faster toward the leak", () => {
    expect(clickTiming(null)).toBeNull();
    expect(clickTiming(1.02)).toBeNull();
    const faint = clickTiming(1.2)!;
    const strong = clickTiming(3.5)!;
    expect(strong.intervalMs).toBeLessThan(faint.intervalMs);
    expect(strong.frequencyHz).toBeGreaterThan(faint.frequencyHz);
    expect(clickTiming(50)).toEqual({ intervalMs: 40, frequencyHz: 3000 });
  });
});

describe("demo sniffer", () => {
  const still = () => 0.5; // no wander

  it("peaks over the buried leak and reads clean far from it", () => {
    const over = responseOf(demoReading(62, 0, still))!;
    const near = responseOf(demoReading(55, 0, still))!;
    const far = responseOf(demoReading(10, 0, still))!;
    expect(over).toBeGreaterThan(near);
    expect(near).toBeGreaterThan(far);
    expect(responseBand(over)).toBe("strong");
    expect(responseBand(far)).toBe("clean");
  });
});

describe("peakPoint", () => {
  it("finds the highest response", () => {
    expect(peakPoint([{ response: 1.1 }, { response: 2.4 }, { response: 1.9 }])).toEqual({ response: 2.4 });
    expect(peakPoint([])).toBeNull();
  });
});
