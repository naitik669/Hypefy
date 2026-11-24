/**
 * What a client is allowed to report, and in what shape.
 *
 * `/api/client-error` forwards to the server-side Sentry, which is why
 * neither client ships the Sentry SDK — and why neither needs a DSN. The
 * relay is rate-limited **per IP at 20 an hour**, not per user, so the two
 * clients share one budget wherever they share a network: a phone on the
 * house wifi reporting freely would starve the browser beside it of the
 * reports that matter. The caps below are what keeps that from happening,
 * and they are the website's own numbers rather than new ones.
 *
 * The other half is the stream's usefulness. The relay tags every report
 * with its `kind`, so an exception and a stall can be told apart in Sentry —
 * but only if both clients use the same four words for them. A phone
 * inventing a fifth kind is a bucket nobody is looking at.
 */

/** Exceptions. Self-limiting in practice, but a loop can throw forever. */
export const MAX_PER_SESSION = 5;

/**
 * Health reports get their own, smaller budget. Unlike an exception they
 * are not self-limiting: a phone that is slow stays slow, and would report
 * on every sample until the hour's quota was gone.
 */
export const MAX_HEALTH_PER_SESSION = 3;

/** The relay truncates to these anyway; doing it here saves sending them. */
export const MAX_MESSAGE = 500;
export const MAX_STACK = 4000;
export const MAX_URL = 300;

/** How much of a message decides whether it is "the same error again". */
export const DEDUPE_KEY_LENGTH = 200;

/**
 * The four kinds the relay knows.
 *
 * `error` and `unhandledrejection` are failures. `longtask` and `memory`
 * are the symptoms of the one failure that throws NOTHING — a freeze
 * produces no exception and no rejection, so without these the thing users
 * actually report left no trace anywhere.
 */
export const REPORT_KINDS = ["error", "unhandledrejection", "longtask", "memory"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export function isHealthKind(kind: ReportKind): boolean {
  return kind === "longtask" || kind === "memory";
}

/** What the client has spent so far. Owned by the caller; nothing global. */
export type ReportBudget = {
  /** Dedupe keys already reported. */
  seen: Set<string>;
  errors: number;
  health: number;
};

export function newBudget(): ReportBudget {
  return { seen: new Set<string>(), errors: 0, health: 0 };
}

/**
 * May this be reported, and what should be sent?
 *
 * Returns the payload to post, or `null` to stay silent. The budget is
 * mutated on a yes, which is the whole point of passing it in: two call
 * sites sharing one budget is the behaviour, and a function that counted
 * internally could not be tested without a reset.
 *
 * **Dedupe is by message only, deliberately.** The same error from two
 * stacks is one defect, and reporting it twice spends a budget of five on
 * one bug. The web learnt this; the phone inherits it rather than
 * rediscovering it.
 */
export function nextReport(
  budget: ReportBudget,
  input: { kind: ReportKind; message: string; stack?: string; url?: string },
): { kind: ReportKind; message: string; stack: string; url: string } | null {
  const message = (input.message ?? "").trim();
  if (!message) return null;

  if (isHealthKind(input.kind)) {
    // Not deduped: "blocked 1200ms" and "blocked 3400ms" are two facts
    // about the same session, and the budget is what bounds them.
    if (budget.health >= MAX_HEALTH_PER_SESSION) return null;
    budget.health += 1;
  } else {
    if (budget.errors >= MAX_PER_SESSION) return null;
    const key = message.slice(0, DEDUPE_KEY_LENGTH);
    if (budget.seen.has(key)) return null;
    budget.seen.add(key);
    budget.errors += 1;
  }

  return {
    kind: input.kind,
    message: message.slice(0, MAX_MESSAGE),
    stack: (input.stack ?? "").slice(0, MAX_STACK),
    url: (input.url ?? "").slice(0, MAX_URL),
  };
}

/**
 * A task this long has already dropped frames; past a second it reads as a
 * freeze rather than as jank.
 */
export const LONG_TASK_MS = 1000;

/** How often to take a health sample. Rare on purpose: this runs for everybody. */
export const HEALTH_EVERY_MS = 30_000;

/** Consecutive rises before growth is called growth rather than noise. */
export const RISES_BEFORE_REPORTING = 4;
