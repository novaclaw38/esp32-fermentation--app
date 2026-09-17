import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import type { Device } from "../../types/database";

interface Props {
  device: Device;
  onDeleted: () => void;
}

export default function RemoveDeviceForm({ device, onDeleted }: Props) {
  // Two-step, not a browser confirm() -- a confirm() is easy to reflex-dismiss
  // without reading it, and this action cascades to every reading and alert
  // the device has ever posted. Typing the ID back is the same pattern GitHub
  // and Supabase itself use for a delete this size.
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (confirmText.trim() !== device.id) return;

    setDeleting(true);
    setError(null);

    // ON DELETE CASCADE on readings/alerts means this also removes the
    // device's entire history -- there is no undo. The confirm step above is
    // the only guard; nothing here asks again.
    const { error: deleteErr } = await supabase.from("devices").delete().eq("id", device.id);
    setDeleting(false);

    if (deleteErr) {
      setError(deleteErr.message);
      return;
    }
    onDeleted();
  }

  return (
    <div className="rounded-lg border border-breach-500/40 bg-panel-900 p-4">
      <p className="text-sm font-medium text-breach-400">Remove this device</p>
      <p className="mt-1 text-xs text-panel-400">
        Deletes it and every reading and alert it has ever posted. The physical unit keeps
        running and posting — it just has nowhere to land, and will need re-provisioning to
        claim again. This cannot be undone.
      </p>

      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="mt-3 rounded-md border border-breach-500/50 px-3 py-1.5 text-sm font-medium text-breach-400 hover:bg-panel-800"
        >
          Remove device…
        </button>
      ) : (
        <div className="mt-3 space-y-2">
          <label className="block text-xs text-panel-400">
            Type <code className="rounded bg-panel-950 px-1 text-panel-200">{device.id}</code> to confirm
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="mt-1 w-full rounded-md border border-breach-500/50 bg-panel-950 px-2 py-1 text-sm text-panel-200"
              autoFocus
            />
          </label>
          {error && <p className="text-sm text-breach-400">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleDelete}
              disabled={confirmText.trim() !== device.id || deleting}
              className="rounded-md bg-breach-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-breach-400 disabled:opacity-40"
            >
              {deleting ? "Removing…" : "Permanently remove"}
            </button>
            <button
              onClick={() => {
                setConfirming(false);
                setConfirmText("");
                setError(null);
              }}
              className="rounded-md border border-panel-600 px-3 py-1.5 text-sm text-panel-200 hover:bg-panel-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
