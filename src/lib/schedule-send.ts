/**
 * Choosing when a message goes.
 *
 * The arithmetic lives here, away from the sheet, because "tomorrow morning"
 * is the kind of thing that is obviously right until a clock rolls past
 * midnight or a month ends on the 31st. All of it is pure and takes `now`,
 * so the awkward moments can be tested instead of hoped about.
 */

/** Matches scheduled_message_limits() in 0166. Both have to agree. */
export const MIN_LEAD_MS = 30_000;
export const MAX_AHEAD_MS = 90 * 24 * 60 * 60 * 1000;

export type Preset = { id: string; label: string; at: Date };

/** The next time today or tomorrow that the clock reads `hour`:00. */
export function nextAt(hour: number, now: Date): Date {
  const d = new Date(now);
  d.setHours(hour, 0, 0, 0);
  // Not `<=`: a preset for 9am generated at exactly 9am should mean
  // tomorrow, because "9am" has already happened.
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  return d;
}

/**
 * The shortlist, filtered to what is actually still ahead.
 *
 * "This evening" disappears after 6pm rather than silently meaning tomorrow
 * evening — a preset whose label stops being true is worse than one fewer
 * preset.
 */
export function presets(now: Date): Preset[] {
  const inAnHour = new Date(now.getTime() + 60 * 60 * 1000);
  const evening = nextAt(18, now);
  const tomorrow = nextAt(9, now);

  const out: Preset[] = [{ id: "hour", label: "In an hour", at: inAnHour }];
  // Only when it is still today, and far enough off to be worth offering.
  if (evening.getDate() === now.getDate() && evening.getTime() - now.getTime() > 30 * 60 * 1000) {
    out.push({ id: "evening", label: "This evening", at: evening });
  }
  out.push({ id: "tomorrow", label: "Tomorrow morning", at: tomorrow });
  return out.filter((p) => canSchedule(p.at, now) === null);
}

/**
 * Why this time will not do, or null when it will.
 *
 * The same two bounds the database enforces. Checking here as well is not
 * belt and braces — it is so the answer arrives while the person is looking
 * at the picker, instead of as an error after they commit.
 */
export function canSchedule(at: Date | null, now: Date): string | null {
  if (!at || Number.isNaN(at.getTime())) return "Pick a date and time.";
  const ms = at.getTime() - now.getTime();
  if (ms < MIN_LEAD_MS) return "Pick a time a little further ahead.";
  if (ms > MAX_AHEAD_MS) return "That is more than 90 days away.";
  return null;
}

/**
 * The value a `datetime-local` input wants: the local clock, not UTC.
 *
 * toISOString would hand it UTC and the input would display the wrong time
 * for anyone not on GMT — and then read that wrong time back as the
 * intended one.
 */
export function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** And back again. An empty or malformed value is null, never Invalid Date. */
export function fromLocalInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * How a scheduled time is read back to the sender.
 *
 * Today and tomorrow are named rather than dated, because "Today at 18:00"
 * is read in one glance and "24/10/2026, 18:00" is not.
 */
export function describeWhen(at: Date, now: Date): string {
  const time = at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (sameDay(at, now)) return `Today at ${time}`;
  if (sameDay(at, tomorrow)) return `Tomorrow at ${time}`;
  return `${at.toLocaleDateString(undefined, { day: "numeric", month: "short" })} at ${time}`;
}
