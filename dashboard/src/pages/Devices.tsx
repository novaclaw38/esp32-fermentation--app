import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth";
import type { Device } from "../types/database";

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
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
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
      device_secret: secret,
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setCreatedSecret(secret);
    setNewId("");
    setNewName("");
    loadDevices();
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-brew-800">Your devices</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="rounded-md bg-brew-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brew-700"
          >
            {showAddForm ? "Cancel" : "Add device"}
          </button>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-sm text-stone-500 hover:text-stone-700"
          >
            Sign out
          </button>
        </div>
      </div>

      {showAddForm && (
        <form onSubmit={handleAddDevice} className="mb-6 space-y-3 rounded-lg border border-stone-200 bg-white p-4">
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
                    <p className="text-sm text-stone-500">{d.id}</p>
                  </div>
                  <div className="text-right text-sm text-stone-500">
                    <p>
                      {d.temp_min_c}°C – {d.temp_max_c}°C
                    </p>
                    <p>
                      {d.last_seen_at ? `Last seen ${new Date(d.last_seen_at).toLocaleString()}` : "Never checked in"}
                    </p>
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
