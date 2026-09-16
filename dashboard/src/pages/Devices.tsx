import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth";
import type { Device, DeviceType } from "../types/database";
import ClaimDeviceForm from "../components/ClaimDeviceForm";
import ConnectionBadge from "../components/ConnectionBadge";

function randomSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export default function Devices() {
  const { session } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showClaimForm, setShowClaimForm] = useState(false);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<DeviceType>("hub");
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDevices();
  }, []);

  async function loadDevices() {
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from("devices")
      .select("*")
      .order("created_at", { ascending: false });
    if (!loadError && data) setDevices(data as Device[]);
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
        <h1 className="text-2xl font-semibold text-brew-800">Your devices</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setShowClaimForm((v) => !v); setShowAddForm(false); }}
            className="rounded-md bg-brew-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brew-700"
          >
            {showClaimForm ? "Cancel" : "Claim device"}
          </button>
          <button
            onClick={() => { setShowAddForm((v) => !v); setShowClaimForm(false); }}
            className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
          >
            {showAddForm ? "Cancel" : "Add manually"}
          </button>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-sm text-stone-500 hover:text-stone-700"
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
        <form onSubmit={handleAddDevice} className="mb-6 space-y-3 rounded-lg border border-stone-200 bg-white p-4">
          <p className="text-xs text-stone-600">
            For a unit you flashed yourself. Shipped devices arrive already
            provisioned — use <strong>Claim device</strong> instead.
          </p>
          <label className="block text-sm">
            Device ID (matches DEVICE_ID in the firmware, e.g. ferm-monitor-002)
            <input
              required
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1"
              placeholder="ferm-monitor-002"
            />
          </label>
          <label className="block text-sm">
            Display name
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1"
              placeholder="Kitchen Kombucha"
            />
          </label>
          <fieldset className="text-sm">
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
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" className="rounded-md bg-brew-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brew-700">
            Create device
          </button>
        </form>
      )}

      {createdSecret && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="font-medium text-amber-900">Save this device secret now — it won't be shown again:</p>
          <code className="mt-2 block break-all rounded bg-white p-2 text-amber-900">{createdSecret}</code>
          <p className="mt-2 text-amber-800">
            Paste it into <code>DEVICE_SECRET</code> in the firmware sketch alongside the matching{" "}
            <code>DEVICE_ID</code> before flashing this unit.
          </p>
          <button
            onClick={() => setCreatedSecret(null)}
            className="mt-2 text-xs font-medium text-amber-700 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-stone-500">Loading…</p>
      ) : devices.length === 0 ? (
        <p className="text-stone-500">No devices yet. Add one above once you've flashed a unit.</p>
      ) : (
        <ul className="space-y-3">
          {devices.map((d) => (
            <li key={d.id}>
              <Link
                to={`/devices/${d.id}`}
                className="block rounded-lg border border-stone-200 bg-white p-4 hover:border-brew-400"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-stone-900">{d.name}</p>
                    <p className="text-sm text-stone-500">
                      {d.id}
                      {d.device_type === "tilt" && (
                        <span className="ml-2 rounded bg-brew-50 px-1.5 py-0.5 text-xs font-medium text-brew-700">
                          Temp + Gravity
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="text-right text-sm text-stone-500">
                    <p>
                      {d.temp_min_c}°C – {d.temp_max_c}°C
                    </p>
                    <div className="mt-0.5 flex justify-end">
                      <ConnectionBadge device={d} />
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
