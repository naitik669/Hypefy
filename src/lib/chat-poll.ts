/**
 * Polls in a conversation.
 *
 * The question is the message's body and everything else lives in its
 * metadata: the options as written, whether more than one may be chosen,
 * and the tally, which the server recomputes on every vote. This file is
 * the reading of that shape and the arithmetic of the bars — no fetching,
 * so the rules can be checked without a database.
 */

/** A poll as the thread needs it. */
export type Poll = {
  question: string;
  options: string[];
  multi: boolean;
  tally: number[];
  voters: number;
};

export const MIN_POLL_OPTIONS = 2;
export const MAX_POLL_OPTIONS = 6;
export const MAX_POLL_QUESTION = 200;
export const MAX_POLL_OPTION = 60;

/**
 * The poll in a message, or null if there is not one.
 *
 * Everything is checked rather than trusted, because metadata is a jsonb
 * column: an older message, a half-written row or a future version's shape
 * must read as "not a poll" and fall back to the plain bubble, not throw
 * in the middle of a thread.
 */
export function readPoll(m: {
  kind: string;
  body: string | null;
  is_unsent?: boolean;
  metadata?: unknown;
}): Poll | null {
  if (m.kind !== "poll" || m.is_unsent) return null;
  const meta = m.metadata as Record<string, unknown> | null | undefined;
  if (!meta || typeof meta !== "object") return null;

  const options = Array.isArray(meta.options)
    ? meta.options.filter((o): o is string => typeof o === "string" && o.trim() !== "")
    : [];
  if (options.length < MIN_POLL_OPTIONS) return null;

  const raw = Array.isArray(meta.tally) ? meta.tally : [];
  // One count per option, whatever the stored array says. A tally shorter
  // than the options would otherwise render a bar with no number under it.
  const tally = options.map((_, i) => {
    const n = raw[i];
    return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  });

  return {
    question: m.body?.trim() || "Poll",
    options,
    multi: meta.multi === true,
    tally,
    voters: typeof meta.voters === "number" && meta.voters >= 0 ? Math.floor(meta.voters) : 0,
  };
}

/**
 * How wide an option's bar is drawn, 0–100.
 *
 * Against the leading option rather than against the total, so the winner
 * always fills its row. On a multi-choice poll the counts can add up past
 * the number of people, and bars measured against a total would then shrink
 * as more people voted, which reads as the option losing ground.
 */
export function barWidth(tally: number[], i: number): number {
  const n = tally[i] ?? 0;
  const top = Math.max(...tally, 0);
  if (top <= 0) return 0;
  return Math.round((n / top) * 100);
}

/** "3 votes", "1 vote", "No votes yet" — the line under the question. */
export function voteLabel(count: number): string {
  if (count <= 0) return "No votes yet";
  return count === 1 ? "1 vote" : `${count} votes`;
}

/**
 * The options as the server will keep them, so the composer can show the
 * same thing it is about to send.
 *
 * Mirrors send_poll: trimmed, blanks dropped, case-insensitive duplicates
 * dropped keeping the first spelling, cut to the maximum. The server checks
 * again — this exists so the Send button is right about whether there is a
 * poll here, not to be the check.
 */
export function tidyOptions(options: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const one of options) {
    const trimmed = one.trim();
    if (!trimmed || trimmed.length > MAX_POLL_OPTION) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length === MAX_POLL_OPTIONS) break;
  }
  return out;
}

/** Is there a poll to send? */
export function pollReady(question: string, options: readonly string[]): boolean {
  const q = question.trim();
  if (!q || q.length > MAX_POLL_QUESTION) return false;
  return tidyOptions(options).length >= MIN_POLL_OPTIONS;
}
