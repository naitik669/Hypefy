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

/* ── The three drums ───────────────────────────────────────────────────── */

/** Minutes offered. Five-minute steps: twelve rows, and precise enough. */
export const MINUTE_STEP = 5;

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

/** That day at that time, local. */
export function withTime(day: Date, hour: number, minute: number): Date {
  const out = new Date(day);
  out.setHours(hour, minute, 0, 0);
  return out;
}

/**
 * Every day that can be picked, from today to the horizon.
 *
 * The value is the number of days from today, which is what the drum scrolls
 * through; the label is what it reads. Today and tomorrow are named, because
 * the two most common answers should not have to be worked out from a date.
 *
 * Invalid days are left out rather than shown greyed. A drum has no good way
 * to say "this row is dead" — the row under the band is the value, so an
 * unpickable row under the band is a contradiction.
 *
 * Which is why the ends are filtered, not just generated. Both of them can
 * be dead:
 *
 *   Late at night, today has nothing left. Opening on a "Today" that offers
 *   one time, or none, is what made the picker look broken.
 *
 *   The last day is only partly inside the horizon, because that is counted
 *   in hours from now and the drum is counted in whole days. At nine in the
 *   morning the ninetieth day runs out at nine in the morning, so its
 *   afternoon does not exist — and if the arithmetic lands badly, neither
 *   does any of it.
 */
export function dayOptions(now: Date): { value: number; label: string; date: Date }[] {
  const today = startOfDay(now);
  const days = Math.floor(MAX_AHEAD_MS / (24 * 60 * 60 * 1000));
  return Array.from({ length: days + 1 }, (_, i) => {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const label =
      i === 0
        ? "Today"
        : i === 1
          ? "Tomorrow"
          : date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
    return { value: i, label, date };
  }).filter((d) => hourOptions(d.date, now).length > 0);
}

/** The day `n` days from today. */
export function dayFromOffset(offset: number, now: Date): Date {
  const d = startOfDay(now);
  d.setDate(d.getDate() + offset);
  return d;
}

/* ── Twelve-hour time ──────────────────────────────────────────────────── */

export type Meridiem = "AM" | "PM";

/** AM and PM as drum values, since a wheel row carries a number. */
export const AM = 0;
export const PM = 1;

/**
 * 24-hour to what a clock face shows.
 *
 * Midnight is 12 AM and noon is 12 PM, not 0 of either. That pair is where
 * every twelve-hour bug lives: `hour % 12` gives 0 for both, and an hour
 * labelled "0 AM" is not a time anybody recognises.
 */
export function to12h(hour24: number): { hour12: number; meridiem: Meridiem } {
  const meridiem: Meridiem = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour12, meridiem };
}

/** And back. The same midnight and noon care, in reverse. */
export function from12h(hour12: number, meridiem: Meridiem): number {
  const base = hour12 % 12;
  return meridiem === "AM" ? base : base + 12;
}

/** A clock face reads 12, 1, 2 … 11, not 1 … 12. */
const CLOCK_ORDER = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/**
 * The twelve-hour rows still ahead within one half of the day.
 *
 * Left out rather than greyed, like every other drum here.
 */
export function hour12Options(
  day: Date,
  meridiem: Meridiem,
  now: Date,
): { value: number; label: string }[] {
  return CLOCK_ORDER.filter(
    (h12) => minuteValues(day, from12h(h12, meridiem), now).length > 0,
  ).map((h12) => ({ value: h12, label: String(h12) }));
}

/**
 * Which halves of the day still have anything in them.
 *
 * On today after noon there is no AM left, and offering it would put a row
 * under the band that resolves to nothing.
 */
export function meridiemOptions(day: Date, now: Date): { value: number; label: string }[] {
  const out: { value: number; label: string }[] = [];
  if (hour12Options(day, "AM", now).length > 0) out.push({ value: AM, label: "AM" });
  if (hour12Options(day, "PM", now).length > 0) out.push({ value: PM, label: "PM" });
  return out;
}

/**
 * The hours still ahead on that day.
 *
 * An hour survives while any of its minute steps is still schedulable, so
 * the current hour does not vanish at one minute past while :30 is fine.
 */
export function hourOptions(day: Date, now: Date): { value: number; label: string }[] {
  const out: { value: number; label: string }[] = [];
  for (let hour = 0; hour < 24; hour++) {
    const live = minuteValues(day, hour, now).length > 0;
    if (live) out.push({ value: hour, label: String(hour).padStart(2, "0") });
  }
  return out;
}

/** The minutes still ahead within that hour, as plain numbers. */
export function minuteValues(day: Date, hour: number, now: Date): number[] {
  const out: number[] = [];
  for (let m = 0; m < 60; m += MINUTE_STEP) {
    if (canSchedule(withTime(day, hour, m), now) === null) out.push(m);
  }
  return out;
}

/** The same, as drum rows. */
export function minuteOptions(day: Date, hour: number, now: Date): { value: number; label: string }[] {
  return minuteValues(day, hour, now).map((m) => ({ value: m, label: String(m).padStart(2, "0") }));
}

/**
 * Pull a chosen hour and minute back into what the new day allows.
 *
 * Moving the day drum from tomorrow to today can strand the clock in a time
 * that has already gone. Returning the nearest still-valid pair keeps the
 * other two drums showing something true instead of something the Send
 * button would then refuse.
 */
export function clampTime(
  day: Date,
  hour: number,
  minute: number,
  now: Date,
): { hour: number; minute: number } {
  const hours = hourOptions(day, now);
  if (hours.length === 0) return { hour, minute };
  const h = hours.some((o) => o.value === hour) ? hour : hours[0].value;
  const mins = minuteValues(day, h, now);
  const m = mins.includes(minute) ? minute : (mins[0] ?? 0);
  return { hour: h, minute: m };
}

/**
 * Keep a time inside the half of the day it was just put in.
 *
 * clampTime on its own is not enough once there is an AM/PM drum: when the
 * chosen hour is no longer valid it falls back to the first valid hour of
 * the whole day, which can be in the other half — so setting the meridiem
 * to AM would silently flip it back to PM. This stays where it was put and
 * moves only within that half.
 *
 * Returns null when that half has nothing left at all, which only happens
 * if a caller offers a meridiem meridiemOptions left out.
 */
export function clampWithinMeridiem(
  day: Date,
  hour12: number,
  meridiem: Meridiem,
  minute: number,
  now: Date,
): { hour: number; minute: number } | null {
  const hours = hour12Options(day, meridiem, now);
  if (hours.length === 0) return null;
  const h12 = hours.some((o) => o.value === hour12) ? hour12 : hours[0].value;
  const hour = from12h(h12, meridiem);
  const mins = minuteValues(day, hour, now);
  return { hour, minute: mins.includes(minute) ? minute : (mins[0] ?? 0) };
}
