import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useDevice } from "../lib/useDevice";
import type { Alert, Device, Reading, ReadingWithGravity } from "../types/database";
import TemperatureChart from "../components/TemperatureChart";
import GravityChart from "../components/GravityChart";
import AlertList from "../components/AlertList";
import UnitToggle from "../components/UnitToggle";
import Gauge from "../components/Gauge";
import { useTempUnit } from "../lib/tempUnitContext";
import { formatTemp } from "../lib/units";
import { getConnectionInfo, formatRelativeTime } from "../lib/connection";
import { getGaugeState, type GaugeState } from "../lib/gaugeState";
import { computeGravitySg, computeGravitySgRaw, formatSg, isCalibrated, isTiltDevice } from "../lib/gravity";
import { computeFermentationAnalytics } from "../lib/fermentationAnalytics";
import FermentationSummary from "../components/FermentationSummary";
import FermentationStageBar from "../components/FermentationStageBar";
import FermentationChart from "../components/FermentationChart";
import FermentationRateChart from "../components/FermentationRateChart";

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
  const { unit } = useTempUnit();
  const { device, loading: deviceLoading, notFound, loadError: deviceLoadError, reload: reloadDevice } =
    useDevice(deviceId);
  const [readings, setReadings] = useState<ReadingWithGravity[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  // Distinct from the device's own loadError -- a failed history/alert fetch
  // must not render as "No readings yet" / "No alerts yet -- good sign",
  // which is reassurance, exactly backwards for a fetch that actually failed.
  const [historyError, setHistoryError] = useState<string | null>(null);

  // The Realtime subscription below is set up once per deviceId, so its
  // callback closes over whatever `device` was at that moment — null, on the
  // first render. A ref gives that callback the current calibration curve
  // without re-subscribing (and dropping events) every time the device row
  // changes.
  const deviceRef = useRef<Device | null>(null);
  deviceRef.current = device;

  useEffect(() => {
    if (!deviceId) return;
    loadHistory();

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

  async function loadHistory() {
    if (!deviceId) return;
    setHistoryLoading(true);
    setHistoryError(null);

    const since = new Date(Date.now() - HISTORY_HOURS * 60 * 60 * 1000).toISOString();

    // Read through the view rather than the table: it carries the same columns
    // plus `gravity_sg`, computed server-side from this device's calibration
    // curve. It's `security_invoker`, so RLS still scopes rows to the owner.
    const [{ data: readingsData, error: readingsError }, { data: alertsData, error: alertsError }] = await Promise.all([
      supabase
        .from("readings_with_gravity")
        .select("*")
        .eq("device_id", deviceId)
        .gte("created_at", since)
        .order("created_at", { ascending: true }),
      supabase.from("alerts").select("*").eq("device_id", deviceId).order("created_at", { ascending: false }).limit(50),
    ]);

    if (readingsError || alertsError) {
      setHistoryError((readingsError ?? alertsError)!.message);
      setHistoryLoading(false);
      return;
    }

    setReadings((readingsData as ReadingWithGravity[]) ?? []);
    setAlerts((alertsData as Alert[]) ?? []);
    setHistoryLoading(false);
  }

  function handleAcknowledged(id: number) {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)));
  }

  if (deviceLoading) {
    return <div className="p-8 text-panel-400">Loading…</div>;
  }

  // Checked before notFound/!device: a load failure on the device fetch
  // itself also leaves `device` null, and without this ordering it would
  // fall through to "Device not found" -- exactly the wrong message for a
  // fetch that failed rather than a device that isn't there.
  if (deviceLoadError) {
    return (
      <div className="p-8">
        <p className="font-medium text-breach-400">Couldn't load this device</p>
        <p className="mt-1 text-sm text-panel-400">{deviceLoadError}</p>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={reloadDevice}
            className="rounded-md border border-breach-500/50 px-3 py-1.5 text-sm font-medium text-breach-400 hover:bg-panel-800"
          >
            Retry
          </button>
          <Link to="/devices" className="text-sm text-brew-400 underline">
            Back to devices
          </Link>
        </div>
      </div>
    );
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
  const fermentationAnalytics = showGravity && calibrated ? computeFermentationAnalytics(device, readings) : null;

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

      <div className="mt-2 mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold uppercase tracking-wide text-panel-200">{device.name}</h1>
          <p className="text-sm text-panel-400">
            {device.id}
            {showGravity && (
              <span className="ml-2 rounded bg-panel-800 px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide text-brew-400">
                Temp + Gravity
              </span>
            )}
          </p>
        </div>
        <Link
          to={`/devices/${device.id}/settings`}
          className="shrink-0 rounded-md border border-panel-600 px-3 py-1.5 text-sm font-medium text-panel-200 hover:bg-panel-800"
        >
          Settings
        </Link>
      </div>

      <section className="mb-8 flex flex-wrap items-center justify-center gap-6 rounded-lg border border-panel-700 bg-panel-900 p-6 sm:justify-start">
        <Gauge
          value={latest ? latest.temperature_c : null}
          min={device.temp_min_c}
          max={device.temp_max_c}
          displayValue={formatTemp(latest?.temperature_c, unit)}
          label="Temp"
          state={tempState}
          stale={connection.status === "stale"}
          subLabel={connection.secondsSinceLastSeen != null ? formatRelativeTime(connection.secondsSinceLastSeen) : undefined}
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
            // SG-notation graduation only when the dial is actually reading
            // gravity -- raw tilt degrees have no such convention, and
            // printing "0.990"/"1.120" next to a tilt-angle needle would be
            // an outright wrong reading, not just an inconsistent one.
            endLabels={latest.gravity_sg != null ? [formatSg(GRAVITY_GAUGE_MIN), formatSg(GRAVITY_GAUGE_MAX)] : undefined}
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
      </section>

      {historyError ? (
        <section className="mb-6 rounded-lg border border-breach-500/40 bg-panel-900 p-4">
          <p className="text-sm font-medium text-breach-400">Couldn't load history</p>
          <p className="mt-1 text-sm text-panel-400">{historyError}</p>
          <button
            onClick={loadHistory}
            className="mt-2 rounded-md border border-breach-500/50 px-3 py-1.5 text-sm font-medium text-breach-400 hover:bg-panel-800"
          >
            Retry
          </button>
        </section>
      ) : historyLoading ? (
        <p className="mb-6 text-sm text-panel-400">Loading history…</p>
      ) : (
        <>
          {showGravity && calibrated && (fermentationAnalytics ? (
            <section className="mb-6 space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-panel-400">Fermentation</h2>
              <FermentationSummary analytics={fermentationAnalytics} />
              <FermentationStageBar
                analytics={fermentationAnalytics}
                device={device}
                latestTempC={latest ? latest.temperature_c : null}
              />
            </section>
          ) : (
            <section className="mb-6 rounded-lg border border-panel-700 bg-panel-900 p-4 text-sm text-panel-400">
              Waiting for the first calibrated reading to set this batch's original gravity — ABV,
              attenuation, and fermentation stage will appear here once it does.
            </section>
          ))}

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

          {showGravity && calibrated && (
            <>
              <section className="mb-6">
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-panel-400">
                  Gravity + Temperature · last {HISTORY_HOURS}h
                </h2>
                <FermentationChart readings={readings} />
              </section>

              <section className="mb-6">
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-panel-400">
                  Fermentation rate · SG per 24h
                </h2>
                <FermentationRateChart readings={readings} />
              </section>
            </>
          )}

          <section className="mb-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-panel-400">Alerts</h2>
            <AlertList alerts={alerts} onAcknowledged={handleAcknowledged} />
          </section>
        </>
      )}
    </div>
  );
}
