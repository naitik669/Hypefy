/**
 * Interactive stickers in a conversation: quiz, hype slider, question and
 * countdown, the Show stickers ported into DMs (migration 0221).
 *
 * Same shape as a poll (chat-poll.ts): the words are the message's body,
 * everything else its metadata, and the counts a cache the server rewrites
 * on every answer. This file reads that shape and words the card. No
 * fetching, so the rules can be checked without a database.
 *
 * **One rule for who sees an answer** (design D5 B, 27 Nov 2026): counts for
 * everyone, names only for whoever asked. Shows always worked that way; DM
 * polls did not until 0221. Every card says it on its face, and the words
 * come from `whoSees` so the four cards and the poll cannot drift apart.
 */

import { MAX_POLL_OPTION, MAX_POLL_OPTIONS, MAX_POLL_QUESTION, MIN_POLL_OPTIONS } from "./chat-poll";
import { MAX_STICKER_LINE } from "./show-layers";

export const CHAT_STICKER_KINDS = ["quiz", "slider", "question", "countdown"] as const;
export type ChatStickerKind = (typeof CHAT_STICKER_KINDS)[number];

export type ChatQuiz = { kind: "quiz"; question: string; options: string[]; answer: number; tally: number[]; voters: number };
export type ChatSlider = { kind: "slider"; prompt: string; avg: number; count: number };
export type ChatQuestion = { kind: "question"; prompt: string; count: number };
export type ChatCountdown = { kind: "countdown"; title: string; at: string };
export type ChatSticker = ChatQuiz | ChatSlider | ChatQuestion | ChatCountdown;

/** The longest answer to a question, as 0221 bounds it. */
export const MAX_QUESTION_ANSWER = 500;
/** A countdown can be at most this far off, as 0221 bounds it. */
export const MAX_COUNTDOWN_DAYS = 366;

const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

/**
 * The interactive sticker in a message, or null.
 *
 * `metadata.sticker` must name the kind. send_message lets any caller pass
 * any kind but whitelists metadata, so a forwarded quiz arrives as kind
 * 'quiz' with no options and no `sticker` — that has to draw as its words
 * in a plain bubble, not as a quiz nobody can answer.
 */
export function readChatSticker(m: {
  kind: string;
  body: string | null;
  is_unsent?: boolean;
  metadata?: unknown;
}): ChatSticker | null {
  if (m.is_unsent) return null;
  if (!(CHAT_STICKER_KINDS as readonly string[]).includes(m.kind)) return null;
  const meta = m.metadata as Record<string, unknown> | null | undefined;
  if (!meta || typeof meta !== "object" || meta.sticker !== m.kind) return null;
  const words = m.body?.trim() ?? "";
  if (!words) return null;

  switch (m.kind as ChatStickerKind) {
    case "quiz": {
      const options = Array.isArray(meta.options)
        ? meta.options.filter((o): o is string => typeof o === "string" && o.trim() !== "")
        : [];
      // The answer is an index: if any option was unreadable the rest have
      // shifted, and marking one right would mark the wrong one.
      if (!Array.isArray(meta.options) || options.length !== meta.options.length) return null;
      if (options.length < MIN_POLL_OPTIONS || options.length > MAX_POLL_OPTIONS) return null;
      const answer = meta.answer;
      if (typeof answer !== "number" || !Number.isInteger(answer) || answer < 0 || answer >= options.length) return null;
      const raw = Array.isArray(meta.tally) ? meta.tally : [];
      return { kind: "quiz", question: words, options, answer, tally: options.map((_, i) => count(raw[i])), voters: count(meta.voters) };
    }
    case "slider":
      return { kind: "slider", prompt: words, avg: Math.min(100, count(meta.avg)), count: count(meta.count) };
    case "question":
      return { kind: "question", prompt: words, count: count(meta.count) };
    case "countdown": {
      const at = typeof meta.at === "string" ? meta.at : "";
      if (!at || Number.isNaN(Date.parse(at))) return null;
      return { kind: "countdown", title: words, at: new Date(at).toISOString() };
    }
  }
}

/**
 * The line on the card that says who sees what.
 *
 * `asker` is the sender's name as this viewer knows them, or null when the
 * viewer is the one who asked.
 */
export function whoSees(kind: "poll" | ChatStickerKind, asker: string | null): string {
  if (kind === "countdown") return "Nothing to see: a countdown has no votes";
  const what =
    kind === "question" ? "answers" : kind === "slider" ? "who moved it" : kind === "quiz" ? "who answered" : "who voted";
  if (asker === null) return kind === "question" ? "You asked, so you see the answers" : "You asked, so you see the names";
  if (kind === "question") return `Only ${asker} sees your answer`;
  return `Only ${asker}, who asked, sees ${what}`;
}

/** The same rule, said to the asker before they send it. */
export function rulePromise(kind: "poll" | ChatStickerKind): string {
  if (kind === "countdown") return "A countdown takes no answers. Everyone sees it tick.";
  if (kind === "question") return "Only you will see their answers.";
  return "Everyone sees the counts. Only you see who.";
}

/**
 * "4 of 6 answered".
 *
 * Out of the people who can answer: everyone in the chat for a poll, since
 * the asker votes in their own poll; everyone but the asker for the rest,
 * since 0221 refuses an asker's answer to their own sticker.
 */
export function answeredLabel(kind: "poll" | ChatStickerKind, answered: number, members: number): string {
  const can = Math.max(0, kind === "poll" ? members : members - 1);
  const n = Math.max(0, Math.floor(answered));
  if (can <= 1) return n > 0 ? "Answered" : "Not answered yet";
  return `${Math.min(n, can)} of ${can} answered`;
}

/** A tally as whole percentages of the people who answered. */
export function percents(tally: readonly number[], voters: number): number[] {
  if (voters <= 0) return tally.map(() => 0);
  return tally.map((n) => Math.round((Math.max(0, n) / voters) * 100));
}

/** The slider's 0–100 as the "4.2 of 5" the card prints. */
export function sliderScore(avg: number): string {
  const v = Math.min(100, Math.max(0, avg));
  return (1 + (v / 100) * 4).toFixed(1);
}

// ── Writing one ─────────────────────────────────────────────────────────

/** Is there a quiz to send? Mirrors send_dm_sticker: options must be distinct, not tidied. */
export function quizReady(question: string, options: readonly string[], answer: number | null): boolean {
  const q = question.trim();
  if (!q || q.length > MAX_POLL_QUESTION) return false;
  const clean = options.map((o) => o.trim());
  if (clean.length < MIN_POLL_OPTIONS || clean.length > MAX_POLL_OPTIONS) return false;
  if (clean.some((o) => !o || o.length > MAX_POLL_OPTION)) return false;
  if (new Set(clean.map((o) => o.toLowerCase())).size !== clean.length) return false;
  return answer !== null && Number.isInteger(answer) && answer >= 0 && answer < clean.length;
}

/** Is there a slider or a question to send? */
export function promptReady(prompt: string): boolean {
  const p = prompt.trim();
  return p.length > 0 && p.length <= MAX_POLL_QUESTION;
}

/** Is there a countdown to send? A title of a line, and a time still to come within a year. */
export function countdownReady(title: string, at: string, now = Date.now()): boolean {
  const t = title.trim();
  if (!t || t.length > MAX_STICKER_LINE) return false;
  const when = Date.parse(at);
  if (!Number.isFinite(when) || when <= now) return false;
  return when <= now + MAX_COUNTDOWN_DAYS * 86_400_000;
}
