/**
 * Deciding whether a session still owes a second factor.
 *
 * Pulled out of the middleware so it can be tested. Every branch here is a way
 * to lock a real person out of their own account or to wave an attacker
 * through, and neither is something to find out about in production.
 */

/** The shape this needs from a Supabase user. */
export type FactorLike = { status?: string | null };

/**
 * The assurance level a token was issued at, or null if it cannot be read.
 *
 * Decoded, not verified. That is safe ONLY because the caller has already
 * validated this exact token with getUser() against GoTrue — do not copy this
 * into somewhere that hasn't.
 */
export function readAal(accessToken: string | undefined | null): string | null {
  if (!accessToken) return null;
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return null;
    // atob rather than Buffer: this runs in the edge runtime, where Buffer is
    // not guaranteed. Its absence would throw into the catch below and make
    // every token look like it carries no aal at all — which fails open.
    const json = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
    ) as { aal?: string };
    return json.aal ?? null;
  } catch {
    return null;
  }
}

export function needsSecondFactor({
  hasUser,
  userError,
  factors,
  accessToken,
  isProtected,
  enforce,
}: {
  hasUser: boolean;
  /** getUser() reported a problem — see the fail-open note below. */
  userError: boolean;
  /** From the getUser() RESPONSE, not from the stored cookie. */
  factors: FactorLike[] | null | undefined;
  accessToken: string | undefined | null;
  isProtected: boolean;
  /** MFA_ENFORCE !== "0" — the kill switch. */
  enforce: boolean;
}): boolean {
  if (!enforce) return false;
  if (!hasUser || !isProtected) return false;

  // Fail OPEN here, unlike the signed-out gate. If GoTrue is briefly
  // unreachable we must not conclude "needs a second factor" and send everyone
  // to a challenge screen that cannot reach GoTrue either.
  if (userError) return false;

  // An unverified factor is an abandoned enrollment, not a second factor.
  // Treating one as real would strand someone who started setup and gave up.
  const hasVerifiedFactor = (factors ?? []).some(
    (f) => f?.status === "verified"
  );
  if (!hasVerifiedFactor) return false;

  return readAal(accessToken) !== "aal2";
}
