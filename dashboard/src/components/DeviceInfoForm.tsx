import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabaseClient";
import type { Device } from "../types/database";

interface Props {
  device: Device;
  onSaved: (updated: Partial<Device>) => void;
  onDeleted: () => void;
}

const TYPE_LABEL: Record<Device["device_type"], string> = {
  hub: "Hub (temperature only)",
  tilt: "Temp + Gravity",
  co2: "CO₂",
};

export default function DeviceInfoForm({ device, onSaved, onDeleted }: Props) {
  const [name, setName] = useState(device.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Two-step, not a browser confirm() -- a confirm() is easy to reflex-dismiss
  // without reading it, and this action cascades to every reading and alert
  // the device has ever posted. Typing the ID back is the same pattern GitHub
  // and Supabase itself use for a delete this size.
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Unclaiming is reversible (the new code re-claims it), so it gets one
  // click of friction rather than delete's type-to-confirm -- but it still
  // needs a confirm step, since it instantly drops the device out of this
  // page. Once it returns a code there's no second chance to read it: RLS
  // makes a user_id-null row invisible even to the person who just released
  // it, so this is the only place that code is ever shown.
  const [confirmingUnclaim, setConfirmingUnclaim] = useState(false);
  const [unclaiming, setUnclaiming] = useState(false);
  const [unclaimError, setUnclaimError] = useState<string | null>(null);
  const [newClaimCode, setNewClaimCode] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name can't be empty.");
      return;
    }

    setSaving(true);
    const { error: updateError } = await supabase
      .from("devices")
      .update({ name: trimmed })
      .eq("id", device.id);
    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    onSaved({ name: trimmed });
    setSaved(true);
  }

  async function handleDelete() {
    if (confirmText.trim() !== device.id) return;

    setDeleting(true);
    setDeleteError(null);

    // ON DELETE CASCADE on readings/alerts means this also removes the
    // device's entire history -- there is no undo. The confirm step above is
    // the only guard; nothing here asks again.
    const { error: deleteErr } = await supabase.from("devices").delete().eq("id", device.id);
    setDeleting(false);

    if (deleteErr) {
      setDeleteError(deleteErr.message);
      return;
    }
    onDeleted();
  }

  async function handleUnclaim() {
    setUnclaiming(true);
    setUnclaimError(null);

    const { data, error: rpcError } = await supabase.rpc("unclaim_device", { p_device_id: device.id });
    setUnclaiming(false);

    if (rpcError) {
      setUnclaimError(rpcError.message);
      return;
    }
    setNewClaimCode(data as string);
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Name
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSaved(false);
              }}
              className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1"
            />
          </label>
          <label className="text-sm text-stone-500">
            Device ID
            <input
              value={device.id}
              disabled
              className="mt-1 w-full cursor-not-allowed rounded-md border border-stone-200 bg-stone-50 px-2 py-1 text-stone-500"
            />
          </label>
        </div>
        <p className="text-xs text-stone-500">
          {TYPE_LABEL[device.device_type]} · claimed{" "}
          {device.claimed_at ? new Date(device.claimed_at).toLocaleDateString() : new Date(device.created_at).toLocaleDateString()}
        </p>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && !error && <p className="text-sm text-green-700">Saved.</p>}

        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-brew-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brew-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save name"}
        </button>
      </form>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-medium text-amber-900">Unclaim / transfer</p>
        <p className="mt-1 text-xs text-amber-800">
          Releases this device from your account and mints a fresh claim code -- its whole reading
          and alert history stays intact, just waiting for whoever claims it next. Use this to hand
          a unit to someone else, or to move it to a different account of your own.
        </p>

        {newClaimCode ? (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-amber-800">
              New claim code -- write it down or print it now, it won't be shown again:
            </p>
            <code className="block rounded-md border border-amber-300 bg-white px-3 py-2 text-center font-mono text-lg uppercase tracking-widest text-amber-900">
              {newClaimCode.slice(0, 4)}-{newClaimCode.slice(4)}
            </code>
            <button
              onClick={onDeleted}
              className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
            >
              Done
            </button>
          </div>
        ) : !confirmingUnclaim ? (
          <button
            onClick={() => setConfirmingUnclaim(true)}
            className="mt-3 rounded-md border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100"
          >
            Unclaim device…
          </button>
        ) : (
          <div className="mt-3 space-y-2">
            {unclaimError && <p className="text-sm text-red-700">{unclaimError}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleUnclaim}
                disabled={unclaiming}
                className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-40"
              >
                {unclaiming ? "Releasing…" : "Yes, release it"}
              </button>
              <button
                onClick={() => {
                  setConfirmingUnclaim(false);
                  setUnclaimError(null);
                }}
                className="rounded-md border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-100"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm font-medium text-red-900">Remove this device</p>
        <p className="mt-1 text-xs text-red-800">
          Deletes it and every reading and alert it has ever posted. The physical unit keeps
          running and posting — it just has nowhere to land, and will need re-provisioning to
          claim again. This cannot be undone.
        </p>

        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            className="mt-3 rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
          >
            Remove device…
          </button>
        ) : (
          <div className="mt-3 space-y-2">
            <label className="block text-xs text-red-800">
              Type <code className="rounded bg-white px-1">{device.id}</code> to confirm
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="mt-1 w-full rounded-md border border-red-300 px-2 py-1 text-sm"
                autoFocus
              />
            </label>
            {deleteError && <p className="text-sm text-red-700">{deleteError}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                disabled={confirmText.trim() !== device.id || deleting}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40"
              >
                {deleting ? "Removing…" : "Permanently remove"}
              </button>
              <button
                onClick={() => {
                  setConfirming(false);
                  setConfirmText("");
                  setDeleteError(null);
                }}
                className="rounded-md border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-100"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
