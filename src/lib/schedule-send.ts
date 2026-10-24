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

/**
 * The shortlist.
 *
 * Three offsets from now, not times of day. "In a day" is twenty-four hours
 * from this moment, which needs no rule about what counts as morning and
 * cannot be made untrue by the clock passing it — the earlier clock-based
 * presets had to be filtered out as the day wore on, and a list that changes
 * length depending on when you open it is a list you have to read each time.
 */
export function presets(now: Date): Preset[] {
  const after = (ms: number) => new Date(now.getTime() + ms);
  return [
    { id: "hour", label: "In an hour", at: after(60 * 60 * 1000) },
    { id: "day", label: "In a day", at: after(24 * 60 * 60 * 1000) },
    { id: "week", label: "In a week", at: after(7 * 24 * 60 * 60 * 1000) },
  ].filter((p) => canSchedule(p.at, now) === null);
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

/* ── The calendar ──────────────────────────────────────────────────────── */

/** One square in the month grid. */
export type DayCell = {
  date: Date;
  /** False for the leading and trailing days borrowed from the neighbouring
   *  months, which are shown greyed so the weeks line up. */
  inMonth: boolean;
  /** Before today, or past the 90-day horizon. Rendered, never pressable. */
  disabled: boolean;
  today: boolean;
};

/** Midnight on the day `d` falls in, local time. */
export function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

/** Same calendar day, ignoring the clock. */
export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Move by whole months, without the 31st becoming the 1st.
 *
 * `setMonth` on the 31st of a month followed by a 30-day one rolls into the
 * next month — January 31st + 1 would be March 3rd. Landing on the 1st first
 * makes the arithmetic mean what it says, which is all this is used for:
 * paging the grid.
 */
export function addMonths(d: Date, n: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth() + n, 1);
  out.setHours(0, 0, 0, 0);
  return out;
}

/** "October 2026", in the reader's own language. */
export function monthLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** The last day that may be picked: the 90-day horizon the database enforces. */
export function lastPickableDay(now: Date): Date {
  return startOfDay(new Date(now.getTime() + MAX_AHEAD_MS));
}

/**
 * Six weeks of squares for the month `month` falls in, Monday first.
 *
 * Always 42 cells, so the grid does not change height as the months are
 * paged — a calendar that grows and shrinks under the thumb is a calendar
 * whose buttons move while you are reaching for one.
 */
export function monthGrid(month: Date, now: Date): DayCell[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  // getDay is Sunday-first; this app's weeks start on Monday.
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - lead);
  start.setHours(0, 0, 0, 0);

  const today = startOfDay(now);
  const last = lastPickableDay(now);

  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    return {
      date,
      inMonth: date.getMonth() === month.getMonth(),
      disabled: date.getTime() < today.getTime() || date.getTime() > last.getTime(),
      today: sameDay(date, now),
    };
  });
}

/** Whether paging to this month could show anything pickable at all. */
export function monthInRange(month: Date, now: Date): boolean {
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59, 999);
  return end.getTime() >= startOfDay(now).getTime() && month.getTime() <= lastPickableDay(now).getTime();
}

/* ── The clock ─────────────────────────────────────────────────────────── */

/** Minutes offered, so a time is two taps rather than a scroll. */
export const MINUTE_STEPS = [0, 15, 30, 45];

/** That day at that time, local. */
export function withTime(day: Date, hour: number, minute: number): Date {
  const out = new Date(day);
  out.setHours(hour, minute, 0, 0);
  return out;
}

/**
 * Which hours are still ahead on the chosen day.
 *
 * Every hour of a future day; only the ones not yet gone on today. An hour
 * counts as available while any of its minute steps is still schedulable —
 * otherwise the current hour disappears at :01 even though :15 is fine.
 */
export function hourOptions(day: Date, now: Date): { hour: number; disabled: boolean }[] {
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    disabled: !MINUTE_STEPS.some((m) => canSchedule(withTime(day, hour, m), now) === null),
  }));
}

/** And which minutes within a chosen hour. */
export function minuteOptions(day: Date, hour: number, now: Date): { minute: number; disabled: boolean }[] {
  return MINUTE_STEPS.map((minute) => ({
    minute,
    disabled: canSchedule(withTime(day, hour, minute), now) !== null,
  }));
}
