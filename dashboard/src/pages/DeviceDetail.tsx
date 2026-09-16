import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import type { Alert, Device, Reading, ReadingWithGravity } from "../types/database";
import TemperatureChart from "../components/TemperatureChart";
import GravityChart from "../components/GravityChart";
import AlertList from "../components/AlertList";
import ConnectionBadge from "../components/ConnectionBadge";
import ThresholdForm from "../components/ThresholdForm";
import CalibrationForm from "../components/CalibrationForm";
import {
  computeGravitySg,
  computeGravitySgRaw,
  formatSg,
  isCalibrated,
  isTiltDevice,
} from "../lib/gravity";

const HISTORY_HOURS = 48;

export default function DeviceDetail() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const [device, setDevice] = useState<Device | null>(null);
  const [readings, setReadings] = useState<ReadingWithGravity[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // The Realtime subscription below is set up once per deviceId, so its
  // callback closes over whatever `device` was at that moment — null, on the
  // first render. A ref gives that callback the current calibration curve
  // without re-subscribing (and dropping events) every time the device row
  // changes.
  const deviceRef = useRef<Device | null>(null);
  deviceRef.current = device;

  useEffect(() => {
    if (!deviceId) return;
    load();

    const channel = supabase
      .channel(`device-${deviceId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "readings", filter: `device_id=eq.${deviceId}` },
        (payload) => {
          // Realtime replicates the `readings` table, and a view can't emit
          // replication events — so this row arrives with raw tilt and no
          // gravity attached. Apply the device's curve here, or a live reading
          // would drop out of the gravity chart until the next page load.
          // See lib/gravity.ts.
          const row = payload.new as Reading;
          const current = deviceRef.current;
          setReadings((prev) => [
            ...prev,
            {
              ...row,
              gravity_sg: current
                ? computeGravitySg(current, row.tilt_deg ?? null, row.temperature_c ?? null)
                : null,
              gravity_sg_raw: current ? computeGravitySgRaw(current, row.tilt_deg ?? null) : null,
            },
          ]);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "alerts", filter: `device_id=eq.${deviceId}` },
        (payload) => setAlerts((prev) => [payload.new as Alert, ...prev]),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  async function load() {
    if (!deviceId) return;
    setLoading(true);

    const { data: deviceData, error: deviceError } = await supabase
      .from("devices")
      .select("*")
      .eq("id", deviceId)
      .single();

    if (deviceError || !deviceData) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setDevice(deviceData as Device);

    const since = new Date(Date.now() - HISTORY_HOURS * 60 * 60 * 1000).toISOString();

    // Read through the view rather than the table: it carries the same columns
    // plus `gravity_sg`, computed server-side from this device's calibration
    // curve. It's `security_invoker`, so RLS still scopes rows to the owner.
    const [{ data: readingsData }, { data: alertsData }] = await Promise.all([
      supabase
        .from("readings_with_gravity")
        .select("*")
        .eq("device_id", deviceId)
        .gte("created_at", since)
        .order("created_at", { ascending: true }),
      supabase.from("alerts").select("*").eq("device_id", deviceId).order("created_at", { ascending: false }).limit(50),
    ]);

    setReadings((readingsData as ReadingWithGravity[]) ?? []);
    setAlerts((alertsData as Alert[]) ?? []);
    setLoading(false);
  }

  function handleAcknowledged(id: number) {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)));
  }

  function handleThresholdSaved(updates: Partial<Device>) {
    setDevice((prev) => (prev ? { ...prev, ...updates } : prev));
  }

  function handleCalibrationSaved(updates: Partial<Device>) {
    // Recomputing here is what makes a new curve apply to the readings already
    // on screen — matching what a reload would fetch from the view, without
    // needing one.
    setDevice((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...updates };
      setReadings((rows) =>
        rows.map((r) => ({
          ...r,
          gravity_sg: computeGravitySg(next, r.tilt_deg, r.temperature_c),
          gravity_sg_raw: computeGravitySgRaw(next, r.tilt_deg),
        })),
      );
      return next;
    });
  }

  if (loading) {
    return <div className="p-8 text-stone-500">Loading…</div>;
  }

  if (notFound || !device) {
    return (
      <div className="p-8">
        <p className="text-stone-600">Device not found.</p>
        <Link to="/devices" className="text-brew-700 underline">
          Back to devices
        </Link>
      </div>
    );
  }

  const latest = readings[readings.length - 1];
  const showGravity = isTiltDevice(device);
  const calibrated = isCalibrated(device);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link to="/devices" className="text-sm text-stone-500 hover:text-stone-700">
        ← All devices
      </Link>

      <div className="mt-2 mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-brew-800">{device.name}</h1>
          <p className="text-sm text-stone-500">
            {device.id}
            {showGravity && (
              <span className="ml-2 rounded bg-brew-50 px-1.5 py-0.5 text-xs font-medium text-brew-700">
                Temp + Gravity
              </span>
            )}
          </p>
          <div className="mt-1">
            <ConnectionBadge device={device} />
          </div>
        </div>
        {latest && (
          <div className="text-right">
            <p className="text-3xl font-semibold text-stone-900">{latest.temperature_c.toFixed(1)}°C</p>
            {showGravity && latest.gravity_sg != null && (
              <p className="text-lg font-semibold text-brew-700">{formatSg(latest.gravity_sg)} SG</p>
            )}
            {showGravity && latest.gravity_sg == null && latest.tilt_deg != null && (
              <p className="text-sm text-stone-500">{latest.tilt_deg.toFixed(1)}° tilt</p>
            )}
            <p className="text-xs text-stone-500">as of {new Date(latest.created_at).toLocaleTimeString()}</p>
            {latest.battery_v != null && (
              <p className="text-xs text-stone-400">Battery: {latest.battery_v.toFixed(2)}V</p>
            )}
          </div>
        )}
      </div>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">
          Temperature · last {HISTORY_HOURS}h
        </h2>
        <TemperatureChart readings={readings} tempMinC={device.temp_min_c} tempMaxC={device.temp_max_c} />
      </section>

      {showGravity && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">
            {calibrated ? "Gravity" : "Tilt"} · last {HISTORY_HOURS}h
          </h2>
          <GravityChart readings={readings} calibrated={calibrated} />
        </section>
      )}

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">Alerts</h2>
        <AlertList alerts={alerts} onAcknowledged={handleAcknowledged} />
      </section>

      <section className={showGravity ? "mb-6" : undefined}>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">Thresholds</h2>
        <ThresholdForm device={device} onSaved={handleThresholdSaved} />
      </section>

      {showGravity && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">
            Gravity calibration
          </h2>
          <CalibrationForm device={device} onSaved={handleCalibrationSaved} />
        </section>
      )}
    </div>
  );
}
