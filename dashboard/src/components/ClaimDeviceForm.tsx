import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabaseClient";

interface Props {
  onClaimed: () => void;
}

/**
 * Claiming attaches a factory-provisioned device to this account.
 *
 * The customer never sees the device secret — it's flashed at the factory and
 * stays there. What's printed on the unit is a single-use claim code, which
 * `claim_device()` exchanges for ownership and then clears.
 */
export default function ClaimDeviceForm({ onClaimed }: Props) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setClaimed(null);

    // The server normalises too; doing it here as well means the length check
    // below matches what the server will actually look up.
    const normalised = code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (normalised.length !== 8) {
      setError("A claim code is 8 characters, like ABCD-EFGH.");
      return;
    }

    setBusy(true);
    const { data, error: rpcError } = await supabase.rpc("claim_device", {
      p_claim_code: normalised,
    });
    setBusy(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setClaimed(data as string);
    setCode("");
    onClaimed();
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6 space-y-3 rounded-lg border border-stone-200 bg-white p-4">
      <div>
        <p className="text-sm font-medium text-stone-800">Claim a device</p>
        <p className="mt-1 text-xs text-stone-600">
          Enter the code printed on your unit. Hyphens and capitals don't matter.
        </p>
      </div>

      <label className="block text-sm">
        Claim code
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="ABCD-EFGH"
          autoComplete="off"
          spellCheck={false}
          className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1 font-mono uppercase tracking-widest"
        />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {claimed && (
        <p className="text-sm text-green-700">
          Claimed <code>{claimed}</code>. Readings appear after its next wake cycle.
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-brew-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brew-700 disabled:opacity-50"
      >
        {busy ? "Claiming…" : "Claim device"}
      </button>
    </form>
  );
}
