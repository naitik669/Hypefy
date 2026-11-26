/**
 * "Confirm it's you": which challenge an account can actually answer.
 *
 * The step-up used to offer two: the authenticator code when there is a
 * verified factor, and the password otherwise. An account made with
 * "Continue with Google" has no password, so for those people the prompt
 * asked for something that does not exist, and every step behind it was
 * closed to them: deleting the account, changing the email or password,
 * turning on 2FA, the Vault and the chat lock. That was 9 of 25 accounts on
 * 26 Nov 2026.
 *
 * Those accounts get a one-time code sent to their email instead. Like the
 * password path, verifying it mints a fresh session at aal1, which is
 * harmless here for the same reason: this branch only runs when there is no
 * second factor to demote.
 */

export type StepUpMethod = "totp" | "password" | "email_code";

export type StepUpFactor = { factor_type?: string | null; status?: string | null };
export type StepUpIdentity = { provider?: string | null };

/**
 * Whether the account has a password to type.
 *
 * Supabase records a password sign-up as an identity whose provider is
 * "email"; an account that only ever used Google has no such identity and no
 * password. Read from the identities, not the user's email address, which
 * Google accounts have too.
 */
export function hasPasswordIdentity(identities: StepUpIdentity[] | null | undefined): boolean {
  return (identities ?? []).some((i) => i.provider === "email");
}

/** The challenge to show. A verified authenticator always wins. */
export function stepUpMethod(input: {
  factors: StepUpFactor[] | null | undefined;
  identities: StepUpIdentity[] | null | undefined;
}): StepUpMethod {
  const totp = (input.factors ?? []).some(
    (f) => f.factor_type === "totp" && f.status === "verified",
  );
  if (totp) return "totp";
  return hasPasswordIdentity(input.identities) ? "password" : "email_code";
}

type AuthError = { message?: string } | null;

/** The two calls the email-code path needs, taken as an argument so a test can drive it. */
export type StepUpCodeAuth = {
  signInWithOtp(args: {
    email: string;
    options: { shouldCreateUser: boolean };
  }): Promise<{ error: AuthError }>;
  verifyOtp(args: { email: string; token: string; type: "email" }): Promise<{ error: AuthError }>;
};

export type StepUpResult = { ok: true } | { ok: false; error: string };

/**
 * Email the code. Never creates an account: a typo'd or stale address must
 * fail, not sign somebody up.
 */
export async function sendStepUpCode(auth: StepUpCodeAuth, email: string): Promise<StepUpResult> {
  if (!email) return { ok: false, error: "This account has no email to send a code to." };
  const { error } = await auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (error) return { ok: false, error: "Couldn't send the code. Try again in a minute." };
  return { ok: true };
}

/** Check the code. Only digits count, so a pasted "123 456" still works. */
export async function verifyStepUpCode(
  auth: StepUpCodeAuth,
  email: string,
  code: string,
): Promise<StepUpResult> {
  const token = code.replace(/\D/g, "");
  if (!token) return { ok: false, error: "Enter the code from the email." };
  const { error } = await auth.verifyOtp({ email, token, type: "email" });
  if (error) return { ok: false, error: "That code didn't match." };
  return { ok: true };
}
