import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth";
import type { Device, DeviceType, Reading } from "../types/database";
import ClaimDeviceForm from "../components/ClaimDeviceForm";
import UnitToggle from "../components/UnitToggle";
import Gauge from "../components/Gauge";
import GaugeTileSkeleton from "../components/GaugeTileSkeleton";
import { useTempUnit } from "../lib/tempUnitContext";
import { formatTemp } from "../lib/units";
import { getConnectionInfo, formatRelativeTime } from "../lib/connection";
import { getGaugeState } from "../lib/gaugeState";

function randomSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export default function Devices() {
  const { session } = useAuth();
  const { unit } = useTempUnit();
  const [devices, setDevices] = useState<Device[]>([]);
  const [latestReadings, setLatestReadings] = useState<Record<string, Reading>>({});
  const [openAlertDeviceIds, setOpenAlertDeviceIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showClaimForm, setShowClaimForm] = useState(false);
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
  // Focus-dim: hovering/focusing one tile dims the rest of the panel so the
  // one you're reading pops, the way a lit instrument recedes its neighbors.
  const [focusedId, setFocusedId] = useState<string | null>(null);
  // Purely cosmetic (shows/hides the Firmware link) -- AdminRoute is what
  // actually gates the page, so a false positive here can't grant access.
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    loadDevices();
    supabase.rpc("is_admin").then(({ data }) => setIsAdmin(Boolean(data)));
  }, []);

  async function loadDevices() {
    setLoading(true);
    setLoadError(null);
    const { data, error: devicesError } = await supabase
      .from("devices")
      .select("*")
      .order("created_at", { ascending: false });

    if (devicesError) {
      setLoadError(devicesError.message);
      setLoading(false);
      return;
    }
    setDevices((data as Device[]) ?? []);

    // Latest reading per device: RLS already scopes rows to owned devices,
    // so pull a recent batch and reduce to one row per device_id client-side
    // -- simpler than a per-device round trip for a handful of devices.
    const { data: readingsData } = await supabase
      .from("readings")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (readingsData) {
      const latest: Record<string, Reading> = {};
      for (const r of readingsData as Reading[]) {
        if (!latest[r.device_id]) latest[r.device_id] = r;
      }
      setLatestReadings(latest);
    }

    const { data: alertsData } = await supabase.from("alerts").select("device_id").eq("acknowledged", false);
    if (alertsData) setOpenAlertDeviceIds(new Set(alertsData.map((a) => a.device_id as string)));

    setLoading(false);
  }

  async function handleAddDevice(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!session) return;

    const secret = randomSecret();
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
    loadDevices();
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold uppercase tracking-wide text-panel-200">Your devices</h1>
        <div className="flex items-center gap-3">
          <UnitToggle />
          <button
            onClick={() => { setShowClaimForm((v) => !v); setShowAddForm(false); }}
            className="rounded-md bg-brew-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brew-500"
          >
            {showClaimForm ? "Cancel" : "Claim device"}
          </button>
          <button
            onClick={() => { setShowAddForm((v) => !v); setShowClaimForm(false); }}
            className="rounded-md border border-panel-600 px-3 py-1.5 text-sm font-medium text-panel-200 hover:bg-panel-800"
          >
            {showAddForm ? "Cancel" : "Add manually"}
          </button>
          {isAdmin && (
            <Link to="/admin/firmware" className="text-sm text-panel-400 hover:text-panel-200">
              Firmware
            </Link>
          )}
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-sm text-panel-400 hover:text-panel-200"
          >
            Sign out
          </button>
        </div>
      </div>

      {showClaimForm && (
        <ClaimDeviceForm
          onClaimed={() => {
            setShowClaimForm(false);
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
              className="mt-1 w-full rounded-md border border-panel-600 bg-panel-950 px-2 py-1 text-panel-200"
              placeholder="ferm-monitor-002"
            />
          </label>
          <label className="block text-sm text-panel-200">
            Display name
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="mt-1 w-full rounded-md border border-panel-600 bg-panel-950 px-2 py-1 text-panel-200"
              placeholder="Kitchen Kombucha"
            />
          </label>
          <fieldset className="text-sm text-panel-200">
            <legend>Device type</legend>
            <div className="mt-1 space-y-1">
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="device_type"
                  className="mt-1"
                  checked={newType === "hub"}
                  onChange={() => setNewType("hub")}
                />
                <span>
                  <span className="font-medium">Hub</span> — temperature only, external probe.
                  Flash <code>fermentation_monitor_v1</code>.
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="device_type"
                  className="mt-1"
                  checked={newType === "tilt"}
                  onChange={() => setNewType("tilt")}
                />
                <span>
                  <span className="font-medium">Temp + Gravity</span> — the floating module:
                  temperature <em>and</em> gravity. Flash <code>fermentation_tilt_v1</code>, then
                  enter its calibration curve on the device page.
                </span>
              </label>
            </div>
          </fieldset>
          {error && <p className="text-sm text-breach-400">{error}</p>}
          <button type="submit" className="rounded-md bg-brew-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brew-500">
            Create device
          </button>
        </form>
      )}

      {createdSecret && (
        <div className="mb-6 rounded-lg border border-approach-500 bg-panel-900 p-4 text-sm">
          <p className="font-medium text-approach-400">Save this device secret now — it won't be shown again:</p>
          <code className="mt-2 block break-all rounded bg-panel-950 p-2 text-panel-200">{createdSecret}</code>
          <p className="mt-2 text-panel-400">
            Paste it into <code>DEVICE_SECRET</code> in the firmware sketch alongside the matching{" "}
            <code>DEVICE_ID</code> before flashing this unit.
          </p>
          <button
            onClick={() => setCreatedSecret(null)}
            className="mt-2 text-xs font-medium text-approach-400 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <GaugeTileSkeleton key={i} />
          ))}
        </div>
      ) : loadError ? (
        <div className="rounded-lg border border-breach-500/40 bg-panel-900 p-4 text-sm">
          <p className="font-medium text-breach-400">Couldn't load your devices</p>
          <p className="mt-1 text-panel-400">{loadError}</p>
          <button
            onClick={loadDevices}
            className="mt-3 rounded-md border border-breach-500/50 px-3 py-1.5 text-sm font-medium text-breach-400 hover:bg-panel-800"
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {devices.map((d) => {
            const reading = latestReadings[d.id];
            const connection = getConnectionInfo(d, new Date());
            const state = getGaugeState(
              reading ? reading.temperature_c : null,
              d.temp_min_c,
              d.temp_max_c,
              connection.status,
              openAlertDeviceIds.has(d.id),
            );
            const dimmed = focusedId !== null && focusedId !== d.id;

            return (
              <Link
                key={d.id}
                to={`/devices/${d.id}`}
                onMouseEnter={() => setFocusedId(d.id)}
                onMouseLeave={() => setFocusedId(null)}
                onFocus={() => setFocusedId(d.id)}
                onBlur={() => setFocusedId(null)}
                className={`flex items-center gap-4 rounded-lg border border-panel-700 bg-panel-900 p-4 transition-[opacity,border-color] duration-300 hover:border-brew-600 ${dimmed ? "opacity-50" : "opacity-100"}`}
              >
                <Gauge
                  value={reading ? reading.temperature_c : null}
                  min={d.temp_min_c}
                  max={d.temp_max_c}
                  displayValue={formatTemp(reading?.temperature_c, unit)}
                  label="TEMP"
                  state={state}
                  stale={connection.status === "stale"}
                  subLabel={connection.secondsSinceLastSeen != null ? formatRelativeTime(connection.secondsSinceLastSeen) : undefined}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-panel-200">{d.name}</p>
                  <p className="truncate text-xs text-panel-400">
                    {d.id}
                    {d.device_type === "tilt" && (
                      <span className="ml-2 rounded bg-panel-800 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brew-400">
                        Temp + Gravity
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-panel-400">
                    {formatTemp(d.temp_min_c, unit)} – {formatTemp(d.temp_max_c, unit)}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
