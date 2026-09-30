import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useDevice } from "../lib/useDevice";
import { useNow } from "../lib/useNow";
import type { Alert, Device, Reading, ReadingWithGravity } from "../types/database";
import AlertList from "../components/AlertList";
import UnitToggle from "../components/UnitToggle";
import Gauge from "../components/Gauge";
import { useTempUnit } from "../lib/tempUnitContext";
import { formatTemp } from "../lib/units";
import { getConnectionInfo, formatRelativeTime } from "../lib/connection";
import { getGaugeState, type GaugeState } from "../lib/gaugeState";
import { computeGravitySg, computeGravitySgRaw, formatSg, isCalibrated, isTiltDevice } from "../lib/gravity";
import { ANALYTICS_HISTORY_HOURS, computeFermentationAnalytics } from "../lib/fermentationAnalytics";
import FermentationSummary from "../components/FermentationSummary";
import FermentationStageBar from "../components/FermentationStageBar";
import TimeInRangeSummary from "../components/TimeInRange";
import { computeTimeInRange } from "../lib/timeInRange";

// Recharts is the single heaviest dependency in the bundle (Vite's own build
// warning flagged the 800+KB single chunk this pulled into every page,
// including ones -- Login, the device grid -- that never render a chart at
// all). Loaded only once this page actually needs a chart, not on first
// paint of the app.
const TemperatureChart = lazy(() => import("../components/TemperatureChart"));
const GravityChart = lazy(() => import("../components/GravityChart"));
const FermentationChart = lazy(() => import("../components/FermentationChart"));
const FermentationRateChart = lazy(() => import("../components/FermentationRateChart"));

// Fixed-height placeholders matching each chart's own established height, so
// the lazy chunk arriving doesn't shift anything else on the page.
function ChartFallback({ height }: { height: string }) {
  return <div className={`${height} rounded-lg border border-panel-700 bg-panel-900`} />;
}

/** What the charts show. Analytics load further back -- see ANALYTICS_HISTORY_HOURS. */
const CHART_HOURS = 48;

// Typical brewing specific-gravity span -- there's no configured alert
// threshold for gravity (only temperature has one), so this range exists
// purely to give the needle a scale to sweep, not to imply an alert zone.
const GRAVITY_GAUGE_MIN = 0.99;
const GRAVITY_GAUGE_MAX = 1.12;
// Typical LiPo cell span, same reasoning.
const BATTERY_GAUGE_MIN = 0;
const BATTERY_GAUGE_MAX = 4.2;
// Relative humidity is already a 0-100 scale -- no device-specific range to
// pick, unlike temp/gravity/battery above.
const HUMIDITY_GAUGE_MIN = 0;
const HUMIDITY_GAUGE_MAX = 100;

/** Merge by id and keep chronological order -- initial load and Realtime can both deliver the same row. */
function mergeReadings(a: ReadingWithGravity[], b: ReadingWithGravity[]): ReadingWithGravity[] {
  const byId = new Map<number, ReadingWithGravity>();
  for (const r of a) byId.set(r.id, r);
  for (const r of b) byId.set(r.id, r);
  return [...byId.values()].sort((x, y) => x.created_at.localeCompare(y.created_at));
}

const sectionHeading = "mb-2 text-base font-semibold text-panel-200";

export default function DeviceDetail() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const { unit } = useTempUnit();
  const now = useNow();
  const {
    device,
    setDevice,
    loading: deviceLoading,
    notFound,
    loadError: deviceLoadError,
    reload: reloadDevice,
  } = useDevice(deviceId);
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
          setReadings((prev) =>
            mergeReadings(prev, [
              {
                ...row,
                gravity_sg: current ? computeGravitySg(current, row.tilt_deg ?? null, row.temperature_c ?? null) : null,
                gravity_sg_raw: current ? computeGravitySgRaw(current, row.tilt_deg ?? null) : null,
              },
            ]),
          );
          // ingest_reading() bumps last_seen_at in the same transaction, but
          // the device row isn't replicated here -- without this the
          // connection status would keep counting up from page load while
          // fresh readings arrive underneath it.
          setDevice((prev) => (prev ? { ...prev, last_seen_at: row.created_at } : prev));
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "alerts", filter: `device_id=eq.${deviceId}` },
        (payload) => setAlerts((prev) => [payload.new as Alert, ...prev.filter((a) => a.id !== (payload.new as Alert).id)]),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "alerts", filter: `device_id=eq.${deviceId}` },
        // Acknowledged in another tab or on another device.
        (payload) => setAlerts((prev) => prev.map((a) => (a.id === (payload.new as Alert).id ? (payload.new as Alert) : a))),
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

    const since = new Date(Date.now() - ANALYTICS_HISTORY_HOURS * 60 * 60 * 1000).toISOString();

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

    // Merge rather than replace: a Realtime row that landed while this
    // request was in flight would otherwise be overwritten and vanish.
    setReadings((prev) => mergeReadings((readingsData as ReadingWithGravity[]) ?? [], prev));
    setAlerts((alertsData as Alert[]) ?? []);
    setHistoryLoading(false);
  }

  function handleAcknowledged(id: number) {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)));
  }

  if (deviceLoading) {
    return (
      <p role="status" className="p-8 text-panel-400">
        Loading…
      </p>
    );
  }

  // Checked before notFound/!device: a load failure on the device fetch
  // itself also leaves `device` null, and without this ordering it would
  // fall through to "Device not found" -- exactly the wrong message for a
  // fetch that failed rather than a device that isn't there.
  if (deviceLoadError) {
    return (
      <div role="alert" className="p-8">
        <p className="font-medium text-breach-400">Couldn't load this device</p>
        <p className="mt-1 text-sm text-panel-400">{deviceLoadError}</p>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={reloadDevice}
            className="min-h-11 rounded-md border border-breach-500/50 px-3 py-2 text-sm font-medium text-breach-400 hover:bg-panel-800"
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

  const chartSince = now.getTime() - CHART_HOURS * 60 * 60 * 1000;
  const chartReadings = readings.filter((r) => new Date(r.created_at).getTime() >= chartSince);
  const latest = readings[readings.length - 1];
  // The device has reported at some point, but nothing falls in the chart window.
  const silent = device.last_seen_at != null && chartReadings.length === 0;
  // Only once history has loaded: before that `readings` is empty, and a
  // block that appears late would shove the charts down for no reason.
  const timeInRange =
    historyLoading || historyError
      ? null
      : computeTimeInRange(
          chartReadings,
          device.temp_min_c,
          device.temp_max_c,
          device.sleep_interval_seconds,
          CHART_HOURS * 60 * 60 * 1000,
          now.getTime(),
        );
  const showGravity = isTiltDevice(device);
  const calibrated = isCalibrated(device);
  const fermentationAnalytics = showGravity && calibrated ? computeFermentationAnalytics(device, readings) : null;

  const connection = getConnectionInfo(device, now);
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

  const gravityHero = showGravity && latest?.gravity_sg != null;
  const freshness =
    connection.secondsSinceLastSeen != null
      ? formatRelativeTime(connection.secondsSinceLastSeen)
      : "Waiting for first reading";
  const silentSince =
    connection.secondsSinceLastSeen != null ? formatRelativeTime(connection.secondsSinceLastSeen) : null;
  const tempGauge = (size: "sm" | "lg") => (
    <Gauge
      value={latest ? latest.temperature_c : null}
      min={device.temp_min_c}
      max={device.temp_max_c}
      displayValue={formatTemp(latest?.temperature_c, unit)}
      label="Temp"
      state={tempState}
      stale={connection.status === "stale"}
      subLabel={size === "lg" ? freshness : undefined}
      size={size}
    />
  );

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between">
        <Link to="/devices" className="inline-flex min-h-11 items-center text-sm text-panel-400 hover:text-panel-200">
          ← All devices
        </Link>
        <UnitToggle />
      </div>

      <div className="mt-2 mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-semibold text-panel-200">{device.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-panel-400">
            <span className="break-all">{device.id}</span>
            {showGravity && (
              <span className="whitespace-nowrap rounded bg-panel-800 px-1.5 py-0.5 text-xs font-medium text-brew-400">
                Temp + Gravity
              </span>
            )}
          </p>
        </div>
        <Link
          to={`/devices/${device.id}/settings`}
          className="inline-flex min-h-11 shrink-0 items-center rounded-md border border-panel-600 px-3 text-sm font-medium text-panel-200 hover:bg-panel-800"
        >
          Settings
        </Link>
      </div>

      <section
        aria-label="Current readings"
        className="mb-8 flex flex-wrap items-center justify-center gap-6 rounded-lg border border-panel-700 bg-panel-900 p-6 sm:justify-start"
      >
        {gravityHero ? (
          <>
            {/* The float's whole job is gravity -- one device instead of a
                probe plus a hydrometer -- so gravity gets the big dial and the
                freshness line. Temperature moves to a small dial but keeps its
                own state glow, which is where alerts show. */}
            <Gauge
              value={latest.gravity_sg}
              min={GRAVITY_GAUGE_MIN}
              max={GRAVITY_GAUGE_MAX}
              displayValue={formatSg(latest.gravity_sg as number)}
              label="Gravity"
              state={secondaryOffline}
              stale={connection.status === "stale"}
              subLabel={freshness}
              endLabels={[formatSg(GRAVITY_GAUGE_MIN), formatSg(GRAVITY_GAUGE_MAX)]}
              size="lg"
            />
            {tempGauge("sm")}
          </>
        ) : (
          <>
            {tempGauge("lg")}
            {showGravity && latest && (
              // Uncalibrated: raw tilt degrees have no SG graduation, and
              // printing "0.990"/"1.120" beside a tilt needle would be a wrong
              // reading, not just an inconsistent one.
              <Gauge
                value={latest.gravity_sg_raw}
                min={GRAVITY_GAUGE_MIN}
                max={GRAVITY_GAUGE_MAX}
                displayValue={latest.tilt_deg != null ? `${latest.tilt_deg.toFixed(1)}°` : "—"}
                label="Tilt"
                state={secondaryOffline}
                size="sm"
              />
            )}
          </>
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
        {latest?.humidity_pct != null && (
          <Gauge
            value={latest.humidity_pct}
            min={HUMIDITY_GAUGE_MIN}
            max={HUMIDITY_GAUGE_MAX}
            displayValue={`${latest.humidity_pct.toFixed(0)}%`}
            label="Humidity"
            state={secondaryOffline}
            size="sm"
          />
        )}
        {timeInRange && timeInRange.totalMs >= 60 * 60 * 1000 && (
          <TimeInRangeSummary result={timeInRange} minC={device.temp_min_c} maxC={device.temp_max_c} unit={unit} />
        )}
      </section>

      {historyError ? (
        <section role="alert" className="mb-6 rounded-lg border border-breach-500/40 bg-panel-900 p-4">
          <p className="text-sm font-medium text-breach-400">Couldn't load history</p>
          <p className="mt-1 text-sm text-panel-400">{historyError}</p>
          <button
            onClick={loadHistory}
            className="mt-2 min-h-11 rounded-md border border-breach-500/50 px-3 py-2 text-sm font-medium text-breach-400 hover:bg-panel-800"
          >
            Retry
          </button>
        </section>
      ) : historyLoading ? (
        <p role="status" className="mb-6 text-sm text-panel-400">
          Loading history…
        </p>
      ) : (
        <>
          {silent ? (
            // Reported before, but nothing in the window: say so, instead of
            // letting every chart claim "No readings yet" as if the device were
            // new. This is the "never go silent" case, so it names the fix.
            <section role="status" className="mb-6 rounded-lg border border-panel-700 bg-panel-900 p-4">
              <p className="text-base font-semibold text-panel-200">No readings in the last {CHART_HOURS} hours</p>
              <p className="mt-1 text-sm text-panel-400">
                {silentSince ? `This device last reported ${silentSince}. ` : ""}
                Check that it has power and can reach your WiFi. It appears here again as soon as it reports.
              </p>
            </section>
          ) : (
            <>
              {showGravity &&
                calibrated &&
                (fermentationAnalytics ? (
                  <section className="mb-6 space-y-3">
                    <h2 className="text-base font-semibold text-panel-200">Fermentation</h2>
                    <FermentationSummary analytics={fermentationAnalytics} />
                    <FermentationStageBar
                      analytics={fermentationAnalytics}
                      device={device}
                      latestTempC={latest ? latest.temperature_c : null}
                      now={now}
                    />
                  </section>
                ) : (
                  <section className="mb-6 rounded-lg border border-panel-700 bg-panel-900 p-4 text-sm text-panel-400">
                    Waiting for the first calibrated reading to set this batch's original gravity — ABV,
                    attenuation, and fermentation stage will appear here once it does.
                  </section>
                ))}

              {showGravity && calibrated ? (
                <>
                  {/* One chart for the batch, not three: gravity is the story,
                      temperature is the context, and the temperature limits are
                      drawn on it. Separate temperature, gravity and combined
                      charts repeated the same two lines. */}
                  <section className="mb-6">
                    <h2 className={sectionHeading}>Gravity and temperature, last {CHART_HOURS} hours</h2>
                    <Suspense fallback={<ChartFallback height="h-72" />}>
                      <FermentationChart
                        readings={chartReadings}
                        tempMinC={device.temp_min_c}
                        tempMaxC={device.temp_max_c}
                      />
                    </Suspense>
                  </section>

                  <section className="mb-6">
                    <h2 className={sectionHeading}>Fermentation rate</h2>
                    <p className="-mt-1 mb-2 text-sm text-panel-400">Gravity points dropped per 24 hours.</p>
                    <Suspense fallback={<ChartFallback height="h-40" />}>
                      <FermentationRateChart
                        readings={readings}
                        batchStartedAt={device.fermentation_started_at}
                        since={chartSince}
                      />
                    </Suspense>
                  </section>
                </>
              ) : (
                <>
                  <section className="mb-6">
                    <h2 className={sectionHeading}>Temperature, last {CHART_HOURS} hours</h2>
                    <Suspense fallback={<ChartFallback height="h-64" />}>
                      <TemperatureChart readings={chartReadings} tempMinC={device.temp_min_c} tempMaxC={device.temp_max_c} />
                    </Suspense>
                  </section>

                  {showGravity && (
                    <section className="mb-6">
                      <h2 className={sectionHeading}>Tilt, last {CHART_HOURS} hours</h2>
                      <Suspense fallback={<ChartFallback height="h-64" />}>
                        <GravityChart readings={chartReadings} calibrated={calibrated} deviceId={device.id} />
                      </Suspense>
                    </section>
                  )}
                </>
              )}
            </>
          )}

          <section className="mb-6">
            <h2 className={sectionHeading}>Alerts</h2>
            <AlertList alerts={alerts} onAcknowledged={handleAcknowledged} />
          </section>
        </>
      )}
    </main>
  );
}
