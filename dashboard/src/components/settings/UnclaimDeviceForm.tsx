import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import type { Device } from "../../types/database";

interface Props {
  device: Device;
  onUnclaimed: () => void;
}

export default function UnclaimDeviceForm({ device, onUnclaimed }: Props) {
  // Unclaiming is reversible (the new code re-claims it), so it gets one
  // click of friction rather than delete's type-to-confirm -- but it still
  // needs a confirm step, since it instantly drops the device out of this
  // page. Once it returns a code there's no second chance to read it: RLS
  // makes a user_id-null row invisible even to the person who just released
  // it, so this is the only place that code is ever shown.
  const [confirming, setConfirming] = useState(false);
  const [unclaiming, setUnclaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newClaimCode, setNewClaimCode] = useState<string | null>(null);

  async function handleUnclaim() {
    setUnclaiming(true);
    setError(null);

    const { data, error: rpcError } = await supabase.rpc("unclaim_device", { p_device_id: device.id });
    setUnclaiming(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setNewClaimCode(data as string);
  }

  return (
    <div className="rounded-lg border border-approach-500/40 bg-panel-900 p-4">
      <p className="text-sm font-medium text-approach-400">Unclaim / transfer</p>
      <p className="mt-1 text-xs text-panel-400">
        Releases this device from your account and mints a fresh claim code -- its whole reading
        and alert history stays intact, just waiting for whoever claims it next. Use this to hand
        a unit to someone else, or to move it to a different account of your own.
      </p>

      {newClaimCode ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-panel-400">
            New claim code -- write it down or print it now, it won't be shown again:
          </p>
          <code className="block rounded-md border border-approach-500 bg-panel-950 px-3 py-2 text-center font-gauge tabular text-lg uppercase tracking-widest text-approach-400">
            {newClaimCode.slice(0, 4)}-{newClaimCode.slice(4)}
          </code>
          <button
            onClick={onUnclaimed}
            className="rounded-md bg-approach-500 px-3 py-1.5 text-sm font-medium text-panel-950 hover:bg-approach-400"
          >
            Done
          </button>
        </div>
      ) : !confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="mt-3 rounded-md border border-approach-500/50 px-3 py-1.5 text-sm font-medium text-approach-400 hover:bg-panel-800"
        >
          Unclaim device…
        </button>
      ) : (
        <div className="mt-3 space-y-2">
          {error && <p className="text-sm text-breach-400">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleUnclaim}
              disabled={unclaiming}
              className="rounded-md bg-approach-500 px-3 py-1.5 text-sm font-medium text-panel-950 hover:bg-approach-400 disabled:opacity-40"
            >
              {unclaiming ? "Releasing…" : "Yes, release it"}
            </button>
            <button
              onClick={() => {
                setConfirming(false);
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
