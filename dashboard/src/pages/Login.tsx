import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth";

type Mode = "signin" | "signup";

// Supabase's default minimum. Surfaced here so the form can reject a short
// password before a round-trip rather than after one.
const MIN_PASSWORD_LENGTH = 6;

export default function Login() {
  const { session } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (session) {
    return <Navigate to="/devices" replace />;
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setLoading(true);

    if (mode === "signin") {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (signInError) setError(signInError.message);
      // On success the auth listener swaps the session in and this page
      // redirects itself; nothing else to do here.
      return;
    }

    const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    // A signup that succeeds but returns no session means the project still
    // requires email confirmation — the account exists but can't be used until
    // a confirmation email arrives. Say so plainly instead of silently doing
    // nothing, which is what the magic-link flow used to do.
    if (!data.session) {
      setNotice(
        "Account created, but this project still requires email confirmation, " +
          "so you can't sign in yet. Turn off Authentication → Sign In / Providers → " +
          "Email → \"Confirm email\" in the Supabase dashboard, then sign in here.",
      );
      setMode("signin");
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="mb-1 text-2xl font-semibold text-brew-800">Fermentation Monitor</h1>
      <p className="mb-6 text-sm text-stone-500">
        {mode === "signin"
          ? "Sign in with your email and password."
          : "Create an account with your email and a password."}
      </p>

      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block text-sm">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
          />
        </label>

        <label className="block text-sm">
          Password
          <input
            type="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {notice && <p className="rounded-md bg-brew-50 p-3 text-sm text-brew-800">{notice}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-brew-600 px-3 py-2 font-medium text-white hover:bg-brew-700 disabled:opacity-50"
        >
          {loading
            ? mode === "signin"
              ? "Signing in…"
              : "Creating account…"
            : mode === "signin"
              ? "Sign in"
              : "Create account"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-stone-500">
        {mode === "signin" ? (
          <>
            No account yet?{" "}
            <button
              type="button"
              onClick={() => switchMode("signup")}
              className="font-medium text-brew-700 underline"
            >
              Create one
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => switchMode("signin")}
              className="font-medium text-brew-700 underline"
            >
              Sign in
            </button>
          </>
        )}
      </p>
    </div>
  );
}
