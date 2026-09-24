import { forwardRef, useId, useState, type InputHTMLAttributes } from "react";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  /** Persistent guidance under the field -- never only in the placeholder, which vanishes on the first keystroke. */
  hint?: string;
  error?: string | null;
  /** Adds a show/hide control to a password field. */
  revealable?: boolean;
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
      {!open && <path d="M4 20 20 4" />}
    </svg>
  );
}

/**
 * One labelled field in the auth forms: explicit htmlFor/id pairing, hint and
 * error wired through aria-describedby, aria-invalid when in error. Labels use
 * the instrument system's tracked-uppercase label voice.
 */
const AuthField = forwardRef<HTMLInputElement, Props>(function AuthField(
  { label, hint, error, revealable = false, type = "text", className, ...inputProps },
  ref,
) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const [revealed, setRevealed] = useState(false);
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  const inputType = revealable && revealed ? "text" : type;

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium uppercase tracking-wider text-panel-400">
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          type={inputType}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`min-h-11 w-full rounded-md border bg-panel-950 px-3 text-panel-200 placeholder:text-panel-400 ${
            error ? "border-breach-400" : "border-panel-500"
          } ${revealable ? "pr-12" : ""} ${className ?? ""}`}
          {...inputProps}
        />
        {revealable && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? "Hide password" : "Show password"}
            aria-pressed={revealed}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-panel-400 hover:text-panel-200"
          >
            {/* Icon shows the action: an open eye to reveal, a slashed eye to hide. */}
            <EyeIcon open={!revealed} />
          </button>
        )}
      </div>
      {hint && (
        <p id={hintId} className="mt-1 text-xs text-panel-400">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1 text-sm text-breach-400">
          {error}
        </p>
      )}
    </div>
  );
});

export default AuthField;
