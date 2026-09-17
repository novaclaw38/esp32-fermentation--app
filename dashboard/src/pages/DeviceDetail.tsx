import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import type { Alert, Device, Reading, ReadingWithGravity } from "../types/database";
import TemperatureChart from "../components/TemperatureChart";
import GravityChart from "../components/GravityChart";
import AlertList from "../components/AlertList";
import ConnectionBadge from "../components/ConnectionBadge";
import DeviceInfoForm from "../components/DeviceInfoForm";
import ThresholdForm from "../components/ThresholdForm";
import CalibrationForm from "../components/CalibrationForm";
import AlertSettingsForm from "../components/AlertSettingsForm";
import UnitToggle from "../components/UnitToggle";
import Gauge from "../components/Gauge";
import { useTempUnit } from "../lib/tempUnitContext";
import { formatTemp } from "../lib/units";
import { getConnectionInfo } from "../lib/connection";
import { getGaugeState, type GaugeState } from "../lib/gaugeState";
import {
  computeGravitySg,
  computeGravitySgRaw,
  formatSg,
  isCalibrated,
  isTiltDevice,
} from "../lib/gravity";

const HISTORY_HOURS = 48;

// Typical brewing specific-gravity span -- there's no configured alert
// threshold for gravity (only temperature has one), so this range exists
// purely to give the needle a scale to sweep, not to imply an alert zone.
const GRAVITY_GAUGE_MIN = 0.99;
const GRAVITY_GAUGE_MAX = 1.12;
// Typical LiPo cell span, same reasoning.
const BATTERY_GAUGE_MIN = 0;
const BATTERY_GAUGE_MAX = 4.2;

export default function DeviceDetail() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const { unit } = useTempUnit();
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

  function handleDeviceFieldSaved(updates: Partial<Device>) {
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
    return <div className="p-8 text-panel-400">Loading…</div>;
  }

  if (notFound || !device) {
    return (
      <div className="p-8">
        <p className="text-panel-400">Device not found.</p>
        <Link to="/devices" className="text-brew-400 underline">
          Back to devices
        </Link>
      </div>
    );
  }

  const latest = readings[readings.length - 1];
  const showGravity = isTiltDevice(device);
  const calibrated = isCalibrated(device);

  const connection = getConnectionInfo(device, new Date());
  const hasOpenAlert = alerts.some((a) => !a.acknowledged);
  const tempState = getGaugeState(
    latest ? latest.temperature_c : null,
    device.temp_min_c,
    device.temp_max_c,
    connection.status,
    hasOpenAlert,
  );

  const secondaryOffline: GaugeState = connection.status === "offline" || connection.status === "never" ? "offline" : "nominal";
  const batteryState: GaugeState =
    secondaryOffline === "offline"
      ? "offline"
      : device.battery_min_v != null && latest?.battery_v != null && latest.battery_v < device.battery_min_v
        ? "breached"
        : "nominal";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between">
        <Link to="/devices" className="text-sm text-panel-400 hover:text-panel-200">
          ← All devices
        </Link>
        <UnitToggle />
      </div>

      <div className="mt-2 mb-6">
        <h1 className="text-2xl font-semibold uppercase tracking-wide text-panel-200">{device.name}</h1>
        <p className="text-sm text-panel-400">
          {device.id}
          {showGravity && (
            <span className="ml-2 rounded bg-panel-800 px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide text-brew-400">
              Temp + Gravity
            </span>
          )}
        </p>
        <div className="mt-1">
          <ConnectionBadge device={device} />
        </div>
      </div>

      <section className="mb-8 flex flex-wrap items-center justify-center gap-6 rounded-lg border border-panel-700 bg-panel-900 p-6 sm:justify-start">
        <Gauge
          value={latest ? latest.temperature_c : null}
          min={device.temp_min_c}
          max={device.temp_max_c}
          displayValue={formatTemp(latest?.temperature_c, unit)}
          label="Temp"
          state={tempState}
          size="lg"
        />
        {showGravity && latest && (
          <Gauge
            value={latest.gravity_sg ?? latest.gravity_sg_raw}
            min={GRAVITY_GAUGE_MIN}
            max={GRAVITY_GAUGE_MAX}
            displayValue={latest.gravity_sg != null ? `${formatSg(latest.gravity_sg)}` : latest.tilt_deg != null ? `${latest.tilt_deg.toFixed(1)}°` : "—"}
            label={latest.gravity_sg != null ? "Gravity" : "Tilt"}
            state={secondaryOffline}
            size="sm"
          />
        )}
        {latest?.battery_v != null && (
          <Gauge
            value={latest.battery_v}
            min={BATTERY_GAUGE_MIN}
            max={BATTERY_GAUGE_MAX}
            displayValue={`${latest.battery_v.toFixed(2)}V`}
            label="Battery"
            state={batteryState}
            size="sm"
          />
        )}
        {latest && (
          <p className="w-full text-center text-xs text-panel-400 sm:w-auto sm:text-left">
            as of {new Date(latest.created_at).toLocaleTimeString()}
          </p>
        )}
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-panel-400">
          Temperature · last {HISTORY_HOURS}h
        </h2>
        <TemperatureChart readings={readings} tempMinC={device.temp_min_c} tempMaxC={device.temp_max_c} />
      </section>

      {showGravity && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-panel-400">
            {calibrated ? "Gravity" : "Tilt"} · last {HISTORY_HOURS}h
          </h2>
          <GravityChart readings={readings} calibrated={calibrated} />
        </section>
      )}

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-panel-400">Alerts</h2>
        <AlertList alerts={alerts} onAcknowledged={handleAcknowledged} />
      </section>

      <details className="rounded-lg border border-panel-700 bg-panel-900" open>
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold uppercase tracking-wide text-panel-400">
          Settings
        </summary>
        <div className="space-y-6 border-t border-panel-700 p-4">
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-panel-400">
              Device info
            </h3>
            <DeviceInfoForm
              device={device}
              onSaved={handleDeviceFieldSaved}
              onDeleted={() => navigate("/devices")}
            />
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-panel-400">
              Alert thresholds
            </h3>
            <ThresholdForm device={device} onSaved={handleDeviceFieldSaved} />
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-panel-400">
              Alerts &amp; notifications
            </h3>
            <AlertSettingsForm device={device} onSaved={handleDeviceFieldSaved} />
          </section>

          {showGravity && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-panel-400">
                Gravity calibration
              </h3>
              <CalibrationForm device={device} onSaved={handleCalibrationSaved} />
            </section>
          )}
        </div>
      </details>
    </div>
  );
}
