import {
  requestAccountDeletion,
  type DeleteResult,
  type DeleteTransport,
} from "@hypefy/core/account-delete";

/**
 * The phone's account deletion, as steps a test can drive.
 *
 * The screen (DeleteAccount.tsx) renders; this decides. It takes the
 * Supabase auth client and the transport as arguments rather than importing
 * them, because @/supabase and @/site pull in Expo modules that Vitest cannot
 * evaluate — and a module that can only be read as text is the trap this
 * repository keeps falling into.
 *
 * It is the website's flow, step for step (src/components/settings/
 * DeleteAccount.tsx and StepUpDialog.tsx):
 *
 *   1. the username typed to arm the button — @hypefy/core/account-delete;
 *   2. "Confirm it's you": the authenticator code when the account has a
 *      verified factor, the password when it has none;
 *   3. POST /api/account/delete;
 *   4. sign out, and leave.
 *
 * One platform difference, and it is the reason this file exists: the phone
 * has no cookie the site can read, so step 3 sends the access token as a
 * bearer credential. The route validates it with GoTrue exactly as it
 * validates a cookie session.
 */

type Factor = { id: string; factor_type?: string | null; status?: string | null };

/** The slice of `supabase.auth` this needs. */
export type DeleteAuth = {
  mfa: {
    listFactors(): Promise<{ data: { all?: Factor[] | null } | null }>;
    challengeAndVerify(args: { factorId: string; code: string }): Promise<{ error: unknown }>;
  };
  getUser(): Promise<{ data: { user: { email?: string | null } | null } }>;
  signInWithPassword(args: { email: string; password: string }): Promise<{ error: unknown }>;
  getSession(): Promise<{ data: { session: { access_token: string } | null } }>;
  signOut(args: { scope: "local" }): Promise<unknown>;
};

export type StepUp = { mode: "totp"; factorId: string } | { mode: "password" };

/** Which challenge "Confirm it's you" shows, decided as the web decides it. */
export async function stepUpFor(auth: DeleteAuth): Promise<StepUp> {
  const { data } = await auth.mfa.listFactors();
  const verified = (data?.all ?? []).find(
    (f) => f.factor_type === "totp" && f.status === "verified",
  );
  return verified ? { mode: "totp", factorId: verified.id } : { mode: "password" };
}

/**
 * Prove it is the account's owner holding the phone, not someone holding an
 * unlocked phone. Returns the message to show, or null when it passed.
 *
 * The TOTP branch raises the live session to aal2, which the route requires
 * of an account with a factor. The password branch mints a new aal1 session,
 * harmless precisely because it only runs when there is no factor — the
 * same reasoning StepUpDialog.tsx records.
 */
export async function confirmIdentity(
  auth: DeleteAuth,
  step: StepUp,
  value: string,
): Promise<string | null> {
  const entered = step.mode === "totp" ? value.replace(/\D/g, "") : value;
  if (!entered.trim()) {
    return step.mode === "totp" ? "Enter the 6-digit code." : "Enter your password.";
  }
  if (step.mode === "totp") {
    const { error } = await auth.mfa.challengeAndVerify({
      factorId: step.factorId,
      code: entered,
    });
    return error ? "That code didn't match." : null;
  }
  const {
    data: { user },
  } = await auth.getUser();
  const { error } = await auth.signInWithPassword({
    email: user?.email ?? "",
    password: entered,
  });
  return error ? "That password isn't right." : null;
}

/**
 * Delete the signed-in account, then forget the session on this phone.
 *
 * The token is read AFTER the step-up, so it is the one the step-up just
 * produced. Signing out is `local`: the account is gone, and asking GoTrue
 * to revoke a session for a user it no longer has can only fail.
 */
export async function deleteMyAccount({
  auth,
  site,
  transport,
}: {
  auth: DeleteAuth;
  site: string;
  transport: DeleteTransport;
}): Promise<DeleteResult> {
  const {
    data: { session },
  } = await auth.getSession();
  if (!session?.access_token) {
    return { ok: false, error: "You've been signed out. Sign in again, then try again." };
  }
  const result = await requestAccountDeletion({
    site,
    accessToken: session.access_token,
    transport,
  });
  if (result.ok) await auth.signOut({ scope: "local" });
  return result;
}
