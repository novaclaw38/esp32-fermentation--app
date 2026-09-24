/**
 * Supabase auth errors, in the product's words. The raw strings ("Invalid
 * login credentials") name the backend's view of the problem, not the
 * person's, and give no way forward. Each mapping says what went wrong and,
 * where there is one, which recovery action to offer.
 */
export type AuthRecovery = "reset" | "resend-confirmation" | "sign-in";

export interface FriendlyAuthError {
  message: string;
  recovery?: AuthRecovery;
  /** Set when the problem belongs to one field rather than the form. */
  field?: "email" | "password";
}

export function friendlyAuthError(error: { message: string; status?: number }): FriendlyAuthError {
  const raw = error.message.toLowerCase();

  if (raw.includes("invalid login credentials")) {
    return { message: "That email and password don't match. Check for typos, or reset your password.", recovery: "reset" };
  }
  if (raw.includes("email not confirmed")) {
    return {
      message: "This email address hasn't been confirmed yet. Use the link we emailed you, or get a new one.",
      recovery: "resend-confirmation",
    };
  }
  if (raw.includes("already registered") || raw.includes("already exists")) {
    return { message: "There's already an account for this email address.", recovery: "sign-in" };
  }
  if (raw.includes("password should be at least")) {
    return { message: "Use at least 6 characters.", field: "password" };
  }
  if (raw.includes("unable to validate email") || raw.includes("invalid email")) {
    return { message: "That doesn't look like an email address.", field: "email" };
  }
  if (error.status === 429 || raw.includes("rate limit") || raw.includes("too many")) {
    return { message: "Too many attempts in a short time. Wait a minute, then try again." };
  }
  if (raw.includes("failed to fetch") || raw.includes("network")) {
    return { message: "Couldn't reach the server. Check your connection and try again." };
  }
  return { message: error.message };
}
