import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth";
import { useNow } from "../lib/useNow";
import { DEVICE_COLUMNS, type Device, type DeviceType, type Reading } from "../types/database";
import ClaimDeviceForm from "../components/ClaimDeviceForm";
import UnitToggle from "../components/UnitToggle";
import Gauge from "../components/Gauge";
import GaugeTileSkeleton from "../components/GaugeTileSkeleton";
import { useTempUnit } from "../lib/tempUnitContext";
import { formatTemp } from "../lib/units";
import { getConnectionInfo, formatRelativeTime } from "../lib/connection";
import { getGaugeState } from "../lib/gaugeState";
import { computeGravitySg, formatSg, isCalibrated } from "../lib/gravity";
import { describeOpenAlert } from "../lib/alerts";

function randomSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Devices report every ~15 minutes, so a minute between background refreshes
// is plenty to catch a new reading or a new alert without hammering the API.
const REFRESH_MS = 60_000;

const inputClass = "mt-1 w-full rounded-md border border-panel-600 bg-panel-950 min-h-11 px-2 py-2 text-panel-200";
const primaryButton =
  "inline-flex min-h-11 items-center rounded-md bg-brew-600 px-3 text-sm font-medium text-white hover:bg-brew-700 disabled:opacity-50";
const secondaryButton =
  "inline-flex min-h-11 items-center rounded-md border border-panel-600 px-3 text-sm font-medium text-panel-200 hover:bg-panel-800";
const quietLink = "inline-flex min-h-11 items-center px-2 text-sm text-panel-400 hover:text-panel-200";

export default function Devices() {
  const { session } = useAuth();
  const { unit } = useTempUnit();
  const now = useNow();
  const [devices, setDevices] = useState<Device[]>([]);
  const [latestReadings, setLatestReadings] = useState<Record<string, Reading>>({});
  // device id -> its newest open alert. The reason and age are shown on the
  // tile: an offline gauge carries no glow, so without them a dead sensor
  // looked exactly like a device that was merely switched off, and an old
  // unacknowledged alert looked like a live problem.
  const [openAlerts, setOpenAlerts] = useState<Map<string, { reason: string; createdAt: string }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showClaimForm, setShowClaimForm] = useState(false);
  const [claimedNotice, setClaimedNotice] = useState<string | null>(null);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<DeviceType>("hub");
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Distinct from `error` above (the add-device form's own submit error) --
  // this tracks whether the device list itself failed to load, so a failed
  // fetch never renders identically to a genuinely empty account. That
  // ambiguity is exactly the wrong moment to be silent: this product exists
  // to answer "is my batch okay" without the owner checking manually, and a
  // calm "No devices yet" during an outage is the opposite of that.
  const [loadError, setLoadError] = useState<string | null>(null);
  // Same rule for the two side queries: if readings or open alerts fail to
  // load, the tiles would otherwise show "—" or a calm nominal gauge for a
  // device that may well have an open alert.
  const [partialError, setPartialError] = useState<string | null>(null);
  // Focus-dim: hovering/focusing one tile dims the rest of the panel so the
  // one you're reading pops, the way a lit instrument recedes its neighbors.
  const [focusedId, setFocusedId] = useState<string | null>(null);
  // Purely cosmetic (shows/hides the Firmware link) -- AdminRoute is what
  // actually gates the page, so a false positive here can't grant access.
  const [isAdmin, setIsAdmin] = useState(false);

  const loadDevices = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    // A background refresh keeps what's on screen rather than flashing the
    // skeleton every minute.
    if (!silent) setLoading(true);
    const { data, error: devicesError } = await supabase
      .from("devices")
      .select(DEVICE_COLUMNS)
      .order("created_at", { ascending: false });

    if (devicesError) {
      setLoadError(devicesError.message);
      setLoading(false);
      return;
    }
    setLoadError(null);
    setDevices((data as unknown as Device[]) ?? []);

    // latest_readings is DISTINCT ON (device_id): exactly one row per device,
    // however busy its siblings are.
    const [{ data: readingsData, error: readingsError }, { data: alertsData, error: alertsError }] = await Promise.all([
      supabase.from("latest_readings").select("*"),
      supabase.from("alerts").select("device_id,reason,created_at").eq("acknowledged", false).order("created_at", { ascending: false }),
    ]);

    if (readingsData) {
      const latest: Record<string, Reading> = {};
      for (const r of readingsData as Reading[]) latest[r.device_id] = r;
      setLatestReadings(latest);
    }
    if (alertsData) {
      const open = new Map<string, { reason: string; createdAt: string }>();
      for (const a of alertsData as { device_id: string; reason: string; created_at: string }[]) {
        if (!open.has(a.device_id)) open.set(a.device_id, { reason: a.reason, createdAt: a.created_at });
      }
      setOpenAlerts(open);
    }

    const sideError = readingsError ?? alertsError;
    setPartialError(
      sideError
        ? `${readingsError ? "Latest readings" : "Open alerts"} couldn't be loaded, so these gauges may be out of date or miss an alert. ${sideError.message}`
        : null,
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    loadDevices();
    supabase.rpc("is_admin").then(({ data }) => setIsAdmin(Boolean(data)));
  }, [loadDevices]);

  // Keep the panel current while it's left open -- see lib/useNow.ts for why
  // that matters here in particular.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") loadDevices({ silent: true });
    };
    const id = window.setInterval(refresh, REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [loadDevices]);

  async function handleAddDevice(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!session) return;

    const secret = randomSecret();
    // The database hashes device_secret on insert; this is the only moment
    // the plaintext exists anywhere but the unit itself.
    const { error: insertError } = await supabase.from("devices").insert({
      id: newId.trim(),
      user_id: session.user.id,
      name: newName.trim() || "Fermentation Monitor",
      device_type: newType,
      device_secret: secret,
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setCreatedSecret(secret);
    setNewId("");
    setNewName("");
    setNewType("hub");
    setShowAddForm(false);
    loadDevices();
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      {/* Utility row first, on its own line: at phone width the title, two
          actions, the unit toggle, Firmware and Sign out can't share one row
          (it overflowed a 375px screen by 96px and pushed Sign out offscreen). */}
      <nav aria-label="Account" className="-mr-2 mb-2 flex items-center justify-end gap-1">
        <UnitToggle />
        {isAdmin && (
          <Link to="/admin/firmware" className={quietLink}>
            Firmware
          </Link>
        )}
        <button onClick={() => supabase.auth.signOut()} className={quietLink}>
          Sign out
        </button>
      </nav>

      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-panel-200">Your devices</h1>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setShowClaimForm((v) => !v);
              setShowAddForm(false);
            }}
            aria-expanded={showClaimForm}
            className={primaryButton}
          >
            {showClaimForm ? "Cancel" : "Claim device"}
          </button>
          <button
            onClick={() => {
              setShowAddForm((v) => !v);
              setShowClaimForm(false);
            }}
            aria-expanded={showAddForm}
            className={secondaryButton}
          >
            {showAddForm ? "Cancel" : "Add manually"}
          </button>
        </div>
      </header>

      <div aria-live="polite">
        {claimedNotice && (
          <div className="mb-6 flex items-start justify-between gap-3 rounded-lg border border-brew-600 bg-panel-900 p-4 text-sm">
            <p className="text-panel-200">
              Claimed <code className="text-brew-400">{claimedNotice}</code>. Its first reading shows up after its next
              wake cycle, usually within 15 minutes.
            </p>
            <button onClick={() => setClaimedNotice(null)} className="shrink-0 text-xs font-medium text-brew-400 underline">
              Dismiss
            </button>
          </div>
        )}
      </div>

      {showClaimForm && (
        <ClaimDeviceForm
          onClaimed={(deviceId) => {
            setShowClaimForm(false);
            setClaimedNotice(deviceId);
            loadDevices();
          }}
        />
      )}

      {showAddForm && (
        <form onSubmit={handleAddDevice} className="mb-6 space-y-3 rounded-lg border border-panel-700 bg-panel-900 p-4">
          <p className="text-xs text-panel-400">
            For a unit you flashed yourself. Shipped devices arrive already
            provisioned — use <strong className="text-panel-200">Claim device</strong> instead.
          </p>
          <label className="block text-sm text-panel-200">
            Device ID (matches DEVICE_ID in the firmware, e.g. ferm-monitor-002)
            <input
              required
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              className={inputClass}
              placeholder="ferm-monitor-002"
            />
          </label>
          <label className="block text-sm text-panel-200">
            Display name
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className={inputClass}
              placeholder="Kitchen Kombucha"
            />
          </label>
          <fieldset className="text-sm text-panel-200">
            <legend>Device type</legend>
            <div className="mt-1 space-y-1">
              <label className="flex items-start gap-2 py-1">
                <input
                  type="radio"
                  name="device_type"
                  className="mt-1 accent-brew-500"
                  checked={newType === "hub"}
                  onChange={() => setNewType("hub")}
                />
                <span>
                  <span className="font-medium">Hub</span> — temperature only, external probe.
                  Flash <code>fermentation_monitor_v1</code>.
                </span>
              </label>
              <label className="flex items-start gap-2 py-1">
                <input
                  type="radio"
                  name="device_type"
                  className="mt-1 accent-brew-500"
                  checked={newType === "tilt"}
                  onChange={() => setNewType("tilt")}
                />
                <span>
                  <span className="font-medium">Temp + Gravity</span> — the floating module:
                  temperature <em>and</em> gravity. Flash <code>fermentation_tilt_v1</code>, then
                  enter its calibration curve in the device's settings.
                </span>
              </label>
            </div>
          </fieldset>
          {error && (
            <p role="alert" className="text-sm text-breach-400">
              {error}
            </p>
          )}
          <button type="submit" className={primaryButton}>
            Create device
          </button>
        </form>
      )}

      {createdSecret && (
        <div role="status" className="mb-6 rounded-lg border border-approach-500 bg-panel-900 p-4 text-sm">
          <p className="font-medium text-approach-400">Save this device secret now — it won't be shown again:</p>
          <code className="mt-2 block break-all rounded bg-panel-950 p-2 text-panel-200">{createdSecret}</code>
          <p className="mt-2 text-panel-400">
            Paste it into <code>DEVICE_SECRET</code> in the firmware sketch alongside the matching{" "}
            <code>DEVICE_ID</code> before flashing this unit.
          </p>
          <button
            onClick={() => setCreatedSecret(null)}
            className="mt-2 min-h-11 text-xs font-medium text-approach-400 underline"
          >
            I've saved it
          </button>
        </div>
      )}

      {partialError && !loading && !loadError && (
        <div role="alert" className="mb-4 rounded-lg border border-approach-500/40 bg-panel-900 p-3 text-sm text-approach-400">
          {partialError}{" "}
          <button onClick={() => loadDevices()} className="font-medium underline">
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div role="status" aria-label="Loading devices" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <GaugeTileSkeleton key={i} />
          ))}
        </div>
      ) : loadError ? (
        <div role="alert" className="rounded-lg border border-breach-500/40 bg-panel-900 p-4 text-sm">
          <p className="font-medium text-breach-400">Couldn't load your devices</p>
          <p className="mt-1 text-panel-400">{loadError}</p>
          <button
            onClick={() => loadDevices()}
            className="mt-3 min-h-11 rounded-md border border-breach-500/50 px-3 py-2 text-sm font-medium text-breach-400 hover:bg-panel-800"
          >
            Retry
          </button>
        </div>
      ) : devices.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-panel-700 bg-panel-900 px-6 py-12 text-center">
          <Gauge value={null} min={0} max={1} displayValue="—" label="Temp" state="offline" size="lg" />
          <div>
            <p className="font-medium text-panel-200">No instruments online yet</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-panel-400">
              Claim the device with the code printed on your unit, or add one manually if you
              flashed it yourself — it'll take this gauge's place after its first reading.
            </p>
          </div>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {devices.map((d) => {
            const reading = latestReadings[d.id];
            const connection = getConnectionInfo(d, now);
            const state = getGaugeState(
              reading ? reading.temperature_c : null,
              d.temp_min_c,
              d.temp_max_c,
              connection.status,
              openAlerts.has(d.id),
            );
            const openAlert = openAlerts.get(d.id);
            const gravity =
              // Not for an offline float: a days-old gravity printed at full
              // size reads as current, while its gauge already says "—".
              d.device_type === "tilt" && reading && isCalibrated(d) && connection.status !== "offline"
                ? computeGravitySg(d, reading.tilt_deg, reading.temperature_c)
                : null;
            const lastSeen =
              connection.secondsSinceLastSeen != null
                ? `Last seen ${formatRelativeTime(connection.secondsSinceLastSeen)}`
                : "Hasn't reported yet";
            // A temperature alert stays open until it's acknowledged, even
            // after the reading has come back inside the limits -- say so, or
            // "Above maximum" reads as happening now.
            const alertText = openAlert
              ? describeOpenAlert(openAlert, reading?.temperature_c, d, connection.status, now)
              : null;
            const dimmed = focusedId !== null && focusedId !== d.id;

            return (
              <li key={d.id}>
                <Link
                  to={`/devices/${d.id}`}
                  onMouseEnter={() => setFocusedId(d.id)}
                  onMouseLeave={() => setFocusedId(null)}
                  onFocus={() => setFocusedId(d.id)}
                  onBlur={() => setFocusedId(null)}
                  // 70%, not 50%: at half opacity the neighbours' secondary
                  // text fell below AA contrast while one tile was hovered.
                  className={`flex h-full items-center gap-4 rounded-lg border border-panel-700 bg-panel-900 p-4 transition-[opacity,border-color] duration-300 hover:border-brew-600 ${dimmed ? "opacity-70" : "opacity-100"}`}
                >
                  <Gauge
                    value={reading ? reading.temperature_c : null}
                    min={d.temp_min_c}
                    max={d.temp_max_c}
                    displayValue={formatTemp(reading?.temperature_c, unit)}
                    label="Temp"
                    state={state}
                    stale={connection.status === "stale"}
                    subLabel={connection.secondsSinceLastSeen != null ? formatRelativeTime(connection.secondsSinceLastSeen) : undefined}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-panel-200">{d.name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-panel-400">
                      <span className="truncate">{d.id}</span>
                      {d.device_type === "tilt" && (
                        <span className="whitespace-nowrap rounded bg-panel-800 px-1.5 py-0.5 text-xs font-medium text-brew-400">
                          Temp + Gravity
                        </span>
                      )}
                    </p>
                    {/* Gravity is what the float exists to measure, so it gets
                        the tile's biggest number. The gauge stays on
                        temperature: that's the reading alerts are about, and
                        the gauge's glow is the alert signal. */}
                    {gravity != null && (
                      <p className="mt-1.5 font-gauge tabular text-xl font-semibold leading-none text-panel-200">
                        {formatSg(gravity)} <span className="font-sans text-xs font-normal text-panel-400">gravity</span>
                      </p>
                    )}
                    <p className="mt-1.5 text-xs text-panel-400">
                      Range {formatTemp(d.temp_min_c, unit)} to {formatTemp(d.temp_max_c, unit)}
                    </p>
                    {alertText && <p className="mt-1 text-balance text-xs font-medium text-breach-400">{alertText}</p>}
                    <p className="mt-0.5 text-balance text-xs text-panel-400">{lastSeen}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
