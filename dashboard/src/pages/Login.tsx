import { useEffect, useRef, useState, type FormEvent } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth";
import AuthShell from "../components/auth/AuthShell";
import AuthField from "../components/auth/AuthField";
import { friendlyAuthError, type FriendlyAuthError } from "../lib/authErrors";

type Mode = "signin" | "signup" | "forgot" | "sent-confirmation" | "sent-reset";

// Supabase's default minimum. Only checked when an account is created or a
// password is changed -- enforcing it on sign-in could only ever block
// someone whose existing password predates the rule.
export const MIN_PASSWORD_LENGTH = 6;

const HEADING: Record<Mode, string> = {
  signin: "Sign in",
  signup: "Create your account",
  forgot: "Reset your password",
  "sent-confirmation": "Check your inbox",
  "sent-reset": "Check your inbox",
};

const SUBMIT_LABEL: Record<"signin" | "signup" | "forgot", [idle: string, busy: string]> = {
  signin: ["Sign in", "Signing in…"],
  signup: ["Create account", "Creating account…"],
  forgot: ["Send reset link", "Sending…"],
};

const primaryButton =
  "min-h-11 w-full rounded-md bg-brew-600 px-3 text-sm font-medium text-white hover:bg-brew-700 disabled:cursor-wait disabled:bg-brew-800 disabled:text-panel-200";
const secondaryButton =
  "min-h-11 rounded-md border border-panel-500 px-3 text-sm font-medium text-panel-200 hover:bg-panel-800 disabled:cursor-wait disabled:text-panel-400";
const textButton = "inline-flex min-h-11 items-center font-medium text-brew-400 underline underline-offset-2";

function looksLikeEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());
}

function initialMode(param: string | null): Mode {
  return param === "signup" || param === "forgot" ? param : "signin";
}

export default function Login() {
  const { session } = useAuth();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<Mode>(() => initialMode(searchParams.get("mode")));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<FriendlyAuthError | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const previousMode = useRef(mode);

  useEffect(() => {
    document.title = `${HEADING[mode]} · Fermentation Monitor`;
    // A mode change swaps most of the card, and the control that triggered it
    // is often gone. Moving focus to the new heading tells a screen reader
    // where it is and gives keyboard users a sensible starting point -- but
    // not on first load, where the email field is the better first stop.
    if (previousMode.current !== mode) headingRef.current?.focus();
    previousMode.current = mode;
  }, [mode]);

  useEffect(() => {
    if (formError) errorRef.current?.focus();
  }, [formError]);

  if (session) {
    return <Navigate to="/devices" replace />;
  }

  function switchMode(next: Mode) {
    setMode(next);
    setFieldErrors({});
    setFormError(null);
    setResendState("idle");
    if (next === "signin" || next === "signup") setPassword("");
  }

  function validate(): boolean {
    const errors: { email?: string; password?: string } = {};
    if (!email.trim()) errors.email = "Enter your email address.";
    else if (!looksLikeEmail(email)) errors.email = "That doesn't look like an email address.";

    if (mode === "signin" && !password) errors.password = "Enter your password.";
    if (mode === "signup" && password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    }

    setFieldErrors(errors);
    if (errors.email) emailRef.current?.focus();
    else if (errors.password) passwordRef.current?.focus();
    return !errors.email && !errors.password;
  }

  function showError(error: { message: string; status?: number }) {
    const friendly = friendlyAuthError(error);
    if (friendly.field) {
      setFieldErrors({ [friendly.field]: friendly.message });
      (friendly.field === "email" ? emailRef : passwordRef).current?.focus();
      return;
    }
    setFormError(friendly);
  }

  async function sendResetLink() {
    return supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
  }

  async function sendConfirmation() {
    return supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/devices` },
    });
  }

  async function handleResend(kind: "confirmation" | "reset") {
    setResendState("sending");
    const { error } = kind === "reset" ? await sendResetLink() : await sendConfirmation();
    setResendState(error ? "failed" : "sent");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!validate()) return;
    setLoading(true);

    if (mode === "forgot") {
      const { error } = await sendResetLink();
      setLoading(false);
      if (error) return showError(error);
      switchMode("sent-reset");
      return;
    }

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      setLoading(false);
      // On success the auth listener swaps the session in and this page
      // redirects itself.
      if (error) showError(error);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: `${window.location.origin}/devices` },
    });
    setLoading(false);
    if (error) return showError(error);
    // No session back means the project requires email confirmation. With it
    // off, the session arrives here and the redirect above takes over.
    if (!data.session) switchMode("sent-confirmation");
  }

  function recoveryAction(error: FriendlyAuthError) {
    switch (error.recovery) {
      case "reset":
        return (
          <button type="button" onClick={() => switchMode("forgot")} className={textButton}>
            Reset your password
          </button>
        );
      case "resend-confirmation":
        return (
          <button
            type="button"
            onClick={() => handleResend("confirmation")}
            disabled={resendState === "sending"}
            className={textButton}
          >
            {resendState === "sending" ? "Sending…" : resendState === "sent" ? "Sent. Check your inbox" : "Email me a new link"}
          </button>
        );
      case "sign-in":
        return (
          <button type="button" onClick={() => switchMode("signin")} className={textButton}>
            Sign in instead
          </button>
        );
      default:
        return null;
    }
  }

  const heading = (
    <h1 ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-panel-200 focus:outline-none">
      {HEADING[mode]}
    </h1>
  );

  // ---- "Check your inbox" states replace the form entirely. Leaving a live
  // form (and a live Send button) under a "we sent it" message invited a
  // second send and a sign-in attempt that couldn't work yet.
  if (mode === "sent-confirmation" || mode === "sent-reset") {
    const isReset = mode === "sent-reset";
    return (
      <AuthShell
        footer={
          <>
            {isReset ? "Remembered it?" : "Confirmed it?"}{" "}
            <button type="button" onClick={() => switchMode("signin")} className={textButton}>
              Sign in
            </button>
          </>
        }
      >
        <section className="space-y-4 rounded-lg border border-panel-700 bg-panel-900 p-6">
          {heading}
          <p className="text-sm text-panel-200">
            {isReset ? (
              <>
                If <strong className="break-all font-semibold">{email.trim()}</strong> has an account, a link to choose a
                new password is on its way. It expires in an hour.
              </>
            ) : (
              <>
                We sent a confirmation link to <strong className="break-all font-semibold">{email.trim()}</strong>. Open
                it, then come back here and sign in.
              </>
            )}
          </p>
          <p className="text-sm text-panel-400">Nothing after a few minutes? Check your spam folder, or send it again.</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              type="button"
              onClick={() => handleResend(isReset ? "reset" : "confirmation")}
              disabled={resendState === "sending"}
              className={secondaryButton}
            >
              {resendState === "sending" ? "Sending…" : "Send it again"}
            </button>
            <button
              type="button"
              onClick={() => switchMode(isReset ? "forgot" : "signup")}
              className={`${textButton} text-sm`}
            >
              Use a different email
            </button>
          </div>
          <p role="status" className="text-sm text-panel-400">
            {resendState === "sent" && "Sent again."}
            {resendState === "failed" && <span className="text-breach-400">Couldn't send it. Try again in a minute.</span>}
          </p>
        </section>
      </AuthShell>
    );
  }

  const [idleLabel, busyLabel] = SUBMIT_LABEL[mode];

  return (
    <AuthShell
      footer={
        mode === "signin" ? (
          <>
            Just unboxed a unit?{" "}
            <button type="button" onClick={() => switchMode("signup")} className={textButton}>
              Create an account
            </button>
          </>
        ) : (
          <>
            {mode === "signup" ? "Already have an account?" : "Remembered it?"}{" "}
            <button type="button" onClick={() => switchMode("signin")} className={textButton}>
              Sign in
            </button>
          </>
        )
      }
    >
      <form
        onSubmit={handleSubmit}
        noValidate
        aria-busy={loading}
        className="space-y-4 rounded-lg border border-panel-700 bg-panel-900 p-6"
      >
        <div>
          {heading}
          {mode === "signup" && (
            <p className="mt-1 text-sm text-panel-400">
              Once you're in, you'll claim your unit with the 8-character code printed on its label.
            </p>
          )}
          {mode === "forgot" && (
            <p className="mt-1 text-sm text-panel-400">
              Enter the email you signed up with and we'll send a link to choose a new password.
            </p>
          )}
        </div>

        <AuthField
          ref={emailRef}
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
        />

        {mode !== "forgot" && (
          <div>
            <AuthField
              ref={passwordRef}
              label="Password"
              type="password"
              name="password"
              revealable
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              hint={mode === "signup" ? `At least ${MIN_PASSWORD_LENGTH} characters.` : undefined}
              error={fieldErrors.password}
            />
            {mode === "signin" && (
              <div className="flex justify-end">
                <button type="button" onClick={() => switchMode("forgot")} className={`${textButton} text-sm`}>
                  Forgot password?
                </button>
              </div>
            )}
          </div>
        )}

        {formError && (
          <div
            ref={errorRef}
            role="alert"
            tabIndex={-1}
            className="rounded-md border border-breach-500/50 bg-panel-950 px-3 py-2 text-sm text-breach-400 focus:outline-none"
          >
            <p>{formError.message}</p>
            {recoveryAction(formError)}
          </div>
        )}

        <button type="submit" disabled={loading} className={primaryButton}>
          {loading ? busyLabel : idleLabel}
        </button>
      </form>
    </AuthShell>
  );
}
