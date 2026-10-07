/**
 * When to remind someone that Spotlight exists.
 *
 * Spotlight is a small deck tucked at the edge of Messages, with no label.
 * People who have found it do not need telling; people who have not, or who
 * tried it once and forgot, do. So the reminder is tied to use:
 *
 *   never opened        remind often
 *   opened, but not     remind now and then
 *     for a while
 *   opened lately       say nothing
 *
 * Dismissing it is an answer: each time, it stays away for longer.
 * Kept on the device; it is a courtesy, not a record.
 */

export type SpotlightUse = {
  /** When Spotlight was last opened (ms), or null if never. */
  openedAt: number | null;
  /** When the reminder was last dismissed (ms), or null. */
  dismissedAt: number | null;
  /** How many times it has been dismissed. */
  dismissals: number;
};

export const NEVER_USED: SpotlightUse = { openedAt: null, dismissedAt: null, dismissals: 0 };

const DAY = 24 * 60 * 60 * 1000;
/** Opened within this long: they know it is there. */
export const ACTIVE_FOR_MS = 7 * DAY;
/** The first stay-away after a dismissal; it doubles each time. */
const FIRST_SNOOZE_MS = 2 * DAY;
/** Someone who has used Spotlight is given longer between reminders. */
const LAPSED_SNOOZE_MS = 5 * DAY;
const LONGEST_SNOOZE_MS = 21 * DAY;

const KEY = "hypefy_spotlight_use";

export function readSpotlightUse(): SpotlightUse {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<SpotlightUse> | null;
    return {
      openedAt: typeof p?.openedAt === "number" ? p.openedAt : null,
      dismissedAt: typeof p?.dismissedAt === "number" ? p.dismissedAt : null,
      dismissals: typeof p?.dismissals === "number" && p.dismissals > 0 ? Math.floor(p.dismissals) : 0,
    };
  } catch {
    // Private mode: behave as though it is in use, so nothing nags.
    return { openedAt: Date.now(), dismissedAt: null, dismissals: 0 };
  }
}

function write(use: SpotlightUse) {
  try {
    localStorage.setItem(KEY, JSON.stringify(use));
  } catch {
    /* nothing to do */
  }
}

/** Spotlight was opened: the best answer there is. Starts the count again. */
export function noteSpotlightOpened(now = Date.now()) {
  write({ openedAt: now, dismissedAt: null, dismissals: 0 });
}

export function noteNudgeDismissed(now = Date.now()) {
  const use = readSpotlightUse();
  write({ ...use, dismissedAt: now, dismissals: use.dismissals + 1 });
}

/** How long the reminder stays away after its latest dismissal. */
export function snoozeFor(use: SpotlightUse): number {
  if (use.dismissals <= 0) return 0;
  const base = use.openedAt === null ? FIRST_SNOOZE_MS : LAPSED_SNOOZE_MS;
  return Math.min(LONGEST_SNOOZE_MS, base * 2 ** (use.dismissals - 1));
}

export function shouldNudge(use: SpotlightUse, now: number): boolean {
  if (use.openedAt !== null && now - use.openedAt < ACTIVE_FOR_MS) return false;
  if (use.dismissedAt !== null && now - use.dismissedAt < snoozeFor(use)) return false;
  return true;
}

/** What the reminder says, from what is waiting. */
export function nudgeLine(fromOthers: number, hasOwn: boolean): { title: string; text: string; cta: string } {
  if (fromOthers > 0) {
    return {
      title: fromOthers === 1 ? "1 page in Spotlight" : `${fromOthers} pages in Spotlight`,
      text: "From people you follow back. Gone in a day.",
      cta: "Read",
    };
  }
  if (!hasOwn) {
    return {
      title: "Say something for a day",
      text: "A line, a song, a mood. Only people you follow back see it.",
      cta: "Write",
    };
  }
  return { title: "Your page is up", text: "See who read it, and who reacted.", cta: "Open" };
}
