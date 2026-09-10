import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth";

export default function Login() {
  const { session } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (session) {
    return <Navigate to="/devices" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + "/devices" },
    });

    setLoading(false);
    if (signInError) {
      setError(signInError.message);
    } else {
      setSent(true);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="mb-1 text-2xl font-semibold text-brew-800">Fermentation Monitor</h1>
      <p className="mb-6 text-sm text-stone-500">Sign in with a magic link — no password needed.</p>

      {sent ? (
        <p className="rounded-md bg-brew-50 p-3 text-sm text-brew-800">
          Check <strong>{email}</strong> for a sign-in link.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-stone-300 px-3 py-2"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-brew-600 px-3 py-2 font-medium text-white hover:bg-brew-700 disabled:opacity-50"
          >
            {loading ? "Sending…" : "Send magic link"}
          </button>
        </form>
      )}
    </div>
  );
}
