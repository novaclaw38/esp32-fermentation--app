import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth";
import InstrumentMark from "../components/InstrumentMark";
import { MIN_PASSWORD_LENGTH } from "./Login";

const inputClass = "mt-1 w-full rounded-md border border-panel-600 bg-panel-950 px-2 py-2 text-panel-200";

/**
 * Landing page for the emailed reset link. supabase-js reads the recovery
 * token from the URL and signs the visitor in, so by the time the form shows
 * there's a session to update the password on. Without one (an expired or
 * already-used link) it says so instead of showing a form that can't work.
 */
export default function ResetPassword() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    navigate("/devices", { replace: true });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-panel-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-start gap-3">
          <InstrumentMark />
          <div>
            <h1 className="text-xl font-semibold uppercase tracking-wide text-panel-200">Fermentation Monitor</h1>
            <p className="text-sm text-panel-400">Choose a new password</p>
          </div>
        </div>

        {loading ? (
          <p role="status" className="text-panel-400">
            Checking your reset link…
          </p>
        ) : !session ? (
          <div role="alert" className="rounded-lg border border-approach-500/40 bg-panel-900 p-6 text-sm">
            <p className="font-medium text-approach-400">This reset link has expired or was already used.</p>
            <p className="mt-2 text-panel-400">Request a new one from the sign-in page.</p>
            <Link to="/login" className="mt-3 inline-flex min-h-11 items-center font-medium text-brew-400 underline">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-panel-700 bg-panel-900 p-6">
            <label className="block text-sm text-panel-200">
              New password
              <input
                type="password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="block text-sm text-panel-200">
              Confirm new password
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={inputClass}
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-breach-400">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={saving}
              className="min-h-11 w-full rounded-md bg-brew-600 px-3 py-2 text-sm font-medium text-white hover:bg-brew-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save new password"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
