import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import type { Alert, Device, Reading } from "../types/database";
import TemperatureChart from "../components/TemperatureChart";
import AlertList from "../components/AlertList";
import ThresholdForm from "../components/ThresholdForm";

const HISTORY_HOURS = 48;

export default function DeviceDetail() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const [device, setDevice] = useState<Device | null>(null);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!deviceId) return;
    load();

    const channel = supabase
      .channel(`device-${deviceId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "readings", filter: `device_id=eq.${deviceId}` },
        (payload) => setReadings((prev) => [...prev, payload.new as Reading]),
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

    const [{ data: readingsData }, { data: alertsData }] = await Promise.all([
      supabase
        .from("readings")
        .select("*")
        .eq("device_id", deviceId)
        .gte("created_at", since)
        .order("created_at", { ascending: true }),
      supabase.from("alerts").select("*").eq("device_id", deviceId).order("created_at", { ascending: false }).limit(50),
    ]);

    setReadings((readingsData as Reading[]) ?? []);
    setAlerts((alertsData as Alert[]) ?? []);
    setLoading(false);
  }

  function handleAcknowledged(id: number) {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)));
  }

  function handleThresholdSaved(updates: Partial<Device>) {
    setDevice((prev) => (prev ? { ...prev, ...updates } : prev));
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

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link to="/devices" className="text-sm text-stone-500 hover:text-stone-700">
        ← All devices
      </Link>

      <div className="mt-2 mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-brew-800">{device.name}</h1>
          <p className="text-sm text-stone-500">{device.id}</p>
        </div>
        {latest && (
          <div className="text-right">
            <p className="text-3xl font-semibold text-stone-900">{latest.temperature_c.toFixed(1)}°C</p>
            <p className="text-xs text-stone-500">as of {new Date(latest.created_at).toLocaleTimeString()}</p>
            {latest.battery_v != null && (
              <p className="text-xs text-stone-400">Battery: {latest.battery_v.toFixed(2)}V</p>
            )}
          </div>
        )}
      </div>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">
          Last {HISTORY_HOURS}h
        </h2>
        <TemperatureChart readings={readings} tempMinC={device.temp_min_c} tempMaxC={device.temp_max_c} />
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">Alerts</h2>
        <AlertList alerts={alerts} onAcknowledged={handleAcknowledged} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">Thresholds</h2>
        <ThresholdForm device={device} onSaved={handleThresholdSaved} />
      </section>
    </div>
  );
}
