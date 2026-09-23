import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth";
import AuthShell from "../components/auth/AuthShell";
import AuthField from "../components/auth/AuthField";
import { friendlyAuthError } from "../lib/authErrors";
import { MIN_PASSWORD_LENGTH } from "./Login";

const textButton = "inline-flex min-h-11 items-center font-medium text-brew-400 underline underline-offset-2";

/**
 * Landing page for the emailed reset link. supabase-js reads the recovery
 * token from the URL and signs the visitor in, so by the time the form shows
 * there's a session to update the password on. Without one (an expired or
 * already-used link) it says so, and sends them straight to request another.
 */
export default function ResetPassword() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  const expired = !loading && !session;

  useEffect(() => {
    document.title = `${expired ? "Reset link expired" : "Choose a new password"} · Fermentation Monitor`;
  }, [expired]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (password.length < MIN_PASSWORD_LENGTH) next.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    else if (password !== confirm) next.confirm = "The two passwords don't match.";
    setErrors(next);
    if (next.password) return passwordRef.current?.focus();
    if (next.confirm) return confirmRef.current?.focus();

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      const friendly = friendlyAuthError(error);
      setErrors(friendly.field === "password" ? { password: friendly.message } : { form: friendly.message });
      return;
    }
    navigate("/devices", { replace: true });
  }

  if (loading) {
    return (
      <AuthShell>
        <p role="status" className="text-panel-400">
          Checking your reset link…
        </p>
      </AuthShell>
    );
  }

  if (expired) {
    return (
      <AuthShell>
        <section role="alert" className="space-y-3 rounded-lg border border-approach-500/40 bg-panel-900 p-6">
          <h1 className="text-lg font-semibold text-panel-200">This reset link has expired</h1>
          <p className="text-sm text-panel-400">
            Reset links work once and last an hour. Request a new one and use the most recent email.
          </p>
          <Link to="/login?mode=forgot" className={textButton}>
            Send me a new link
          </Link>
        </section>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <form
        onSubmit={handleSubmit}
        noValidate
        aria-busy={saving}
        className="space-y-4 rounded-lg border border-panel-700 bg-panel-900 p-6"
      >
        <h1 className="text-lg font-semibold text-panel-200">Choose a new password</h1>
        <AuthField
          ref={passwordRef}
          label="New password"
          type="password"
          name="new-password"
          revealable
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          error={errors.password}
        />
        <AuthField
          ref={confirmRef}
          label="Confirm new password"
          type="password"
          name="confirm-password"
          revealable
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors.confirm}
        />
        {errors.form && (
          <p role="alert" className="rounded-md border border-breach-500/50 bg-panel-950 px-3 py-2 text-sm text-breach-400">
            {errors.form}
          </p>
        )}
        <button
          type="submit"
          disabled={saving}
          className="min-h-11 w-full rounded-md bg-brew-600 px-3 text-sm font-medium text-white hover:bg-brew-700 disabled:cursor-wait disabled:bg-brew-800 disabled:text-panel-200"
        >
          {saving ? "Saving…" : "Save new password"}
        </button>
      </form>
    </AuthShell>
  );
}
