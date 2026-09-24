import { useCallback, useEffect, useRef, useState } from "react";
import {
  SNIFFER_CONTROL_UUID,
  SNIFFER_NAME_PREFIX,
  SNIFFER_READING_UUID,
  SNIFFER_SERVICE_UUID,
  demoReading,
  encodeCommand,
  parseReading,
  responseOf,
  type SnifferCommand,
  type SnifferReading,
} from "./sniffer";

export type SnifferTransport = "bluetooth" | "demo";
export type SnifferStatus = "idle" | "connecting" | "connected";

export interface TracePoint {
  t: number;
  response: number | null;
}

/** Seconds of history the live trace keeps (10 readings a second). */
const TRACE_SECONDS = 60;
const DEMO_PERIOD_MS = 100;

export function bluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && navigator.bluetooth != null;
}

/**
 * One sniffer connection: real hardware over Web Bluetooth, or the built-in
 * demo. Both feed the same readings, so the page can't tell them apart.
 *
 * `onMark` fires when the operator presses the button on the sniffer.
 */
export function useSniffer(onMark: (reading: SnifferReading) => void) {
  const [transport, setTransport] = useState<SnifferTransport | null>(null);
  const [status, setStatus] = useState<SnifferStatus>("idle");
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [latest, setLatest] = useState<SnifferReading | null>(null);
  const [trace, setTrace] = useState<TracePoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [demoPosition, setDemoPosition] = useState(20);

  const deviceRef = useRef<BluetoothDevice | null>(null);
  const controlRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  const demoTimerRef = useRef<number | null>(null);
  const demoPositionRef = useRef(demoPosition);
  const demoR0Ref = useRef<number | null>(null);
  const onMarkRef = useRef(onMark);

  useEffect(() => {
    onMarkRef.current = onMark;
  }, [onMark]);
  useEffect(() => {
    demoPositionRef.current = demoPosition;
  }, [demoPosition]);

  const handleReading = useCallback((reading: SnifferReading) => {
    const now = Date.now();
    setLatest(reading);
    setTrace((prev) => {
      const cutoff = now - TRACE_SECONDS * 1000;
      const kept = prev[0] && prev[0].t < cutoff ? prev.filter((p) => p.t >= cutoff) : prev;
      return [...kept, { t: now, response: responseOf(reading) }];
    });
    if (reading.markPressed) onMarkRef.current(reading);
  }, []);

  const reset = useCallback(() => {
    if (demoTimerRef.current != null) window.clearInterval(demoTimerRef.current);
    demoTimerRef.current = null;
    controlRef.current = null;
    deviceRef.current = null;
    setTransport(null);
    setStatus("idle");
    setDeviceName(null);
    setLatest(null);
    setTrace([]);
  }, []);

  const onGattDisconnected = useCallback(() => {
    reset();
    setError("The sniffer disconnected. Check it's switched on and in range, then connect again.");
  }, [reset]);

  const connectBluetooth = useCallback(async () => {
    if (!navigator.bluetooth) return;
    setError(null);
    setStatus("connecting");
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [SNIFFER_SERVICE_UUID] }, { namePrefix: SNIFFER_NAME_PREFIX }],
        optionalServices: [SNIFFER_SERVICE_UUID],
      });
      if (!device.gatt) throw new Error("This sniffer doesn't expose a GATT server.");
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(SNIFFER_SERVICE_UUID);
      const reading = await service.getCharacteristic(SNIFFER_READING_UUID);
      controlRef.current = await service.getCharacteristic(SNIFFER_CONTROL_UUID);
      reading.addEventListener("characteristicvaluechanged", (event) => {
        const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
        if (value) handleReading(parseReading(value));
      });
      await reading.startNotifications();
      device.addEventListener("gattserverdisconnected", onGattDisconnected);
      deviceRef.current = device;
      setDeviceName(device.name ?? "Leak sniffer");
      setTransport("bluetooth");
      setStatus("connected");
    } catch (e) {
      setStatus("idle");
      // Closing the chooser isn't an error worth showing.
      if (e instanceof DOMException && e.name === "NotFoundError") return;
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [handleReading, onGattDisconnected]);

  const startDemo = useCallback(() => {
    setError(null);
    demoR0Ref.current = null;
    let seq = 0;
    demoTimerRef.current = window.setInterval(() => {
      const r = demoReading(demoPositionRef.current, seq++);
      // "Zero" in the demo re-bases the response like the real sniffer does.
      if (demoR0Ref.current != null) r.r0Ohm = demoR0Ref.current;
      handleReading(r);
    }, DEMO_PERIOD_MS);
    setDeviceName("Demo sniffer");
    setTransport("demo");
    setStatus("connected");
  }, [handleReading]);

  const disconnect = useCallback(() => {
    const device = deviceRef.current;
    if (device) {
      device.removeEventListener("gattserverdisconnected", onGattDisconnected);
      device.gatt?.disconnect();
    }
    reset();
  }, [onGattDisconnected, reset]);

  const send = useCallback(
    async (cmd: SnifferCommand) => {
      if (transport === "demo") {
        if (cmd.type === "zero" && latest?.rsOhm != null) demoR0Ref.current = latest.rsOhm;
        return;
      }
      const control = controlRef.current;
      if (!control) return;
      try {
        await control.writeValueWithResponse(encodeCommand(cmd));
      } catch (e) {
        setError(`Couldn't send that to the sniffer: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [transport, latest],
  );

  // Leaving the page drops the connection rather than leaving the radio busy.
  useEffect(() => () => disconnect(), [disconnect]);

  return {
    transport,
    status,
    deviceName,
    latest,
    trace,
    error,
    clearError: () => setError(null),
    connectBluetooth,
    startDemo,
    disconnect,
    send,
    demoPosition,
    setDemoPosition,
  };
}
