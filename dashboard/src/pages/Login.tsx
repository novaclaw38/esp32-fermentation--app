import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth";
import InstrumentMark from "../components/InstrumentMark";

type Mode = "signin" | "signup" | "forgot";

// Supabase's default minimum. Surfaced here so the form can reject a short
// password before a round-trip rather than after one.
export const MIN_PASSWORD_LENGTH = 6;

const SUBTITLE: Record<Mode, string> = {
  signin: "Sign in to your panel",
  signup: "Create an account",
  forgot: "Reset your password",
};

const SUBMIT_LABEL: Record<Mode, [idle: string, busy: string]> = {
  signin: ["Sign in", "Signing in…"],
  signup: ["Create account", "Creating account…"],
  forgot: ["Send reset link", "Sending…"],
};

const inputClass = "mt-1 w-full rounded-md border border-panel-600 bg-panel-950 px-2 py-2 text-panel-200";
const textButton = "inline-flex min-h-11 items-center font-medium text-brew-400 underline";

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

    if (mode === "forgot") {
      setLoading(true);
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setLoading(false);
      if (resetError) {
        setError(resetError.message);
        return;
      }
      // Same message whether or not the address has an account, so this form
      // can't be used to find out who's signed up.
      setNotice(`If ${email} has an account, a reset link is on its way. It expires in an hour.`);
      return;
    }

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

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/devices` },
    });
    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    // No session back means the project requires email confirmation (as it
    // should in production). Tell the person what to do next, in their
    // terms -- not how to reconfigure the backend.
    if (!data.session) {
      setNotice(`Check ${email} for a confirmation link. Once you've clicked it, sign in here.`);
      setMode("signin");
      setPassword("");
    }
  }

  const [idleLabel, busyLabel] = SUBMIT_LABEL[mode];

  return (
    <main className="flex min-h-screen items-center justify-center bg-panel-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-start gap-3">
          <InstrumentMark />
          <div>
            <h1 className="text-xl font-semibold uppercase tracking-wide text-panel-200">Fermentation Monitor</h1>
            <p className="text-sm text-panel-400">{SUBTITLE[mode]}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-panel-700 bg-panel-900 p-6">
          <label className="block text-sm text-panel-200">
            Email
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </label>

          {mode !== "forgot" && (
            <label className="block text-sm text-panel-200">
              <span className="flex items-baseline justify-between">
                Password
                {mode === "signin" && (
                  <button
                    type="button"
                    onClick={() => switchMode("forgot")}
                    className="text-xs font-medium text-brew-400 underline"
                  >
                    Forgot password?
                  </button>
                )}
              </span>
              <input
                type="password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
            </label>
          )}

          <div aria-live="polite">
            {error && (
              <p role="alert" className="text-sm text-breach-400">
                {error}
              </p>
            )}
            {notice && (
              <p className="rounded-md border border-brew-600/60 bg-panel-950 p-3 text-sm text-panel-200">{notice}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="min-h-11 w-full rounded-md bg-brew-600 px-3 py-2 text-sm font-medium text-white hover:bg-brew-700 disabled:opacity-50"
          >
            {loading ? busyLabel : idleLabel}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-panel-400">
          {mode === "signin" ? (
            <>
              No account yet?{" "}
              <button type="button" onClick={() => switchMode("signup")} className={textButton}>
                Create one
              </button>
            </>
          ) : (
            <>
              {mode === "signup" ? "Already have an account?" : "Remembered it?"}{" "}
              <button type="button" onClick={() => switchMode("signin")} className={textButton}>
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </main>
  );
}
