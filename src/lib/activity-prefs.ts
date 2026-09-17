/**
 * The Tune sheet's preferences, as stored in profiles.notif_prefs. Absent keys
 * mean the default; see supabase/migrations/0092_tune_activity.sql, which
 * enforces all of this server-side. The client only mirrors it so the screen
 * matches what the server will let through.
 */
export type Level = "all" | "highlights" | "off";

export type ActivityPrefs = {
  hypes?: boolean | "highlights" | "off";
  comments?: boolean | "highlights" | "off";
  mentions?: boolean | "highlights" | "off";
  follows?: boolean | "highlights" | "off";
  shares?: boolean | "highlights" | "off";
  messages?: boolean;
  spotlight_pages?: boolean;
  shows_posted?: boolean;
  milestones?: boolean;
  back_after?: boolean;
  only_following?: boolean;
  daily_summary?: boolean;
  paused_until?: string;
  muted?: string[];
};

export type LevelKey = "hypes" | "comments" | "mentions" | "follows" | "shares";

export function levelOf(prefs: ActivityPrefs, key: LevelKey): Level {
  const v = prefs[key];
  if (v === false || v === "off") return "off";
  if (v === "highlights") return "highlights";
  return "all";
}

/** What set_activity_pref takes for a level: null is the default, "all". */
export function levelValue(level: Level): "highlights" | false | null {
  return level === "all" ? null : level === "off" ? false : "highlights";
}

/** On/off kinds, with the default each has when never set. */
export const KIND_DEFAULTS = {
  spotlight_pages: false,
  shows_posted: false,
  milestones: true,
  back_after: false,
  only_following: false,
  daily_summary: false,
} as const;
export type KindKey = keyof typeof KIND_DEFAULTS;

export function kindOn(prefs: ActivityPrefs, key: KindKey): boolean {
  const v = prefs[key];
  return typeof v === "boolean" ? v : KIND_DEFAULTS[key];
}

/** Spotlight pages are asked about: undecided until Interested or Not. */
export function spotlightDecision(prefs: ActivityPrefs): "ask" | "yes" | "no" {
  const v = prefs.spotlight_pages;
  return v === true ? "yes" : v === false ? "no" : "ask";
}

export type PauseChoice = "hour" | "tomorrow" | "week";

/** When a break chosen at `now` ends. "Until tomorrow" is 8 in the morning. */
export function pauseEnd(choice: PauseChoice, now = new Date()): Date {
  if (choice === "hour") return new Date(now.getTime() + 60 * 60 * 1000);
  if (choice === "week") return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const t = new Date(now);
  t.setDate(t.getDate() + 1);
  t.setHours(8, 0, 0, 0);
  return t;
}

export function pausedUntil(prefs: ActivityPrefs, now = new Date()): Date | null {
  if (!prefs.paused_until) return null;
  const t = new Date(prefs.paused_until);
  return Number.isNaN(t.getTime()) || t <= now ? null : t;
}

/** Which heading a notification sits under, by its newest item. */
export function sectionOf(iso: string, now = new Date()): "today" | "week" | "earlier" {
  const t = new Date(iso);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  if (t >= startOfToday) return "today";
  if (now.getTime() - t.getTime() < 7 * 24 * 60 * 60 * 1000) return "week";
  return "earlier";
}

/** Types that ask something of you: they go in "Needs you" while unread. */
const NEEDS_ANSWER = new Set(["comment_post", "comment_shot", "comment_reply", "mention_post"]);
export function needsYou(type: string, isRead: boolean): boolean {
  if (type === "follow_request") return true;
  return !isRead && NEEDS_ANSWER.has(type);
}
