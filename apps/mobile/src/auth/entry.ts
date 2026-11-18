/**
 * Where the app opens, given what reading the stored session returned.
 *
 * A plain function in its own module so a Node test can call it, because
 * the distinction it makes is the kind a source-as-text assertion cannot
 * see: a session that FAILED TO READ is not a session that is absent.
 * Mutation G2 deleted the error branch and the text-based test stayed
 * green, since the failed state's type and its words were both still in
 * the file.
 *
 * The web's RootPage has three outcomes — onboarding, profile setup, home.
 * The middle one is missing here on purpose: the setup stepper is its own
 * screen and lands with the rest of the profile work, and routing to a
 * screen that does not exist is worse than routing to the feed.
 */
export type Entry =
  | { kind: "home" }
  | { kind: "onboarding" }
  | { kind: "failed"; message: string };

export function entryFor(result: {
  session: unknown;
  error?: { message: string } | null;
}): Entry {
  /*
   * The error is checked FIRST and never collapsed into "no session".
   * Treating a read failure as a sign-out is how a device ends up asking
   * someone to sign in on every launch with nothing to point at — and it
   * would look like working code, because the happy path is identical.
   */
  if (result.error) return { kind: "failed", message: result.error.message };
  return result.session ? { kind: "home" } : { kind: "onboarding" };
}

/** The route each outcome goes to. */
export function routeFor(entry: Entry): "/home" | "/onboarding" | null {
  if (entry.kind === "failed") return null;
  return entry.kind === "home" ? "/home" : "/onboarding";
}
