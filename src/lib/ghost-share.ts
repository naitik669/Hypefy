/**
 * Ghost Share, on the sending side: the small rules and words.
 *
 * Someone chooses one person they follow who follows them back, and a Shot
 * or post is placed near the top of that person's feed. The other person is
 * not told. The sender is told only that it was placed. See 0119 for the
 * rules the database holds; nothing here decides anything it does not.
 */

export type GhostKind = "post" | "shot";

/** What the share sheet learns when it opens (ghost_share_status, 0120). */
export type GhostStatus = { can: boolean; used: number; allowed: number; resetsAt: string | null };

export const NO_GHOST: GhostStatus = { can: false, used: 0, allowed: 0, resetsAt: null };

export function toGhostStatus(data: unknown): GhostStatus {
  const row = (Array.isArray(data) ? data[0] : data) as
    | { can?: boolean; used?: number; allowed?: number; resets_at?: string }
    | null
    | undefined;
  if (!row) return NO_GHOST;
  return { can: !!row.can, used: row.used ?? 0, allowed: row.allowed ?? 0, resetsAt: row.resets_at ?? null };
}

export function ghostLeft(s: GhostStatus): number {
  return Math.max(0, s.allowed - s.used);
}

/** A person who could be chosen (ghost_share_targets). */
export type GhostTarget = {
  id: string;
  name: string;
  username: string | null;
  hue: number;
  avatarUrl: string | null;
  /** Already sent one this week: listed, and not choosable. */
  alreadyThisWeek: boolean;
};

/** Where the thing will turn up, in the words the confirmation uses. */
export function feedName(kind: GhostKind): string {
  return kind === "shot" ? "Shots" : "their home feed";
}

/**
 * The day the allowance comes back, as a weekday in the reader's own
 * timezone. It resets at the start of Monday in India, which is still
 * Sunday for someone further west.
 */
export function resetDay(resetsAt: string | null, locale?: string): string {
  if (!resetsAt) return "next week";
  const d = new Date(resetsAt);
  if (Number.isNaN(d.getTime())) return "next week";
  return d.toLocaleDateString(locale, { weekday: "long" });
}

/** "That's both for this week" for two; "That's all 5 for this week" for more. */
export function limitHeadline(allowed: number): string {
  return allowed === 2 ? "That's both for this week" : `That's all ${allowed} for this week`;
}

/**
 * The confirmation says everything the first few times, then gets out of
 * the way. Counted on the device: it is a courtesy, not a rule.
 */
const EXPLAINED_KEY = "hypefy_ghost_explained";
const EXPLAIN_TIMES = 3;

export function needsFullExplanation(): boolean {
  try {
    return Number(localStorage.getItem(EXPLAINED_KEY) ?? 0) < EXPLAIN_TIMES;
  } catch {
    return true;
  }
}
export function noteExplained() {
  try {
    localStorage.setItem(EXPLAINED_KEY, String(Number(localStorage.getItem(EXPLAINED_KEY) ?? 0) + 1));
  } catch {
    /* private mode: it is explained in full again next time, which is fine */
  }
}

/**
 * What a refusal from the database should say to the sender. Its own
 * messages are written to be shown; anything else (a dropped connection, a
 * rate limit in its own words) becomes one plain line.
 */
const SAYABLE = [
  "You've used your Ghost Shares for this week",
  "Already this week",
  "Couldn't place that",
  "You can't Ghost Share your own",
  "That can't be Ghost Shared",
  "Ghost Share is off right now",
  "Your account can't do that right now",
];
export function ghostError(message: string | null | undefined): string {
  return SAYABLE.find((m) => message?.includes(m)) ?? "Couldn't place that. Try again.";
}
