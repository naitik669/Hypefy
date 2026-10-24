import { describe, it, expect } from "vitest";
import {
  MAX_AHEAD_MS,
  MIN_LEAD_MS,
  canSchedule,
  describeWhen,
  addMonths,
  hourOptions,
  minuteOptions,
  monthGrid,
  monthInRange,
  presets,
  withTime,
} from "@/lib/schedule-send";

/**
 * Choosing when a message goes.
 *
 * "Tomorrow morning" is the kind of thing that is obviously right until a
 * clock rolls past midnight, a month ends on the 31st, or the clocks change.
 * All of this takes `now` as an argument so those moments can be tested
 * rather than hoped about.
 */

const at = (iso: string) => new Date(iso);

describe("presets", () => {
  const now = at("2026-10-24T12:00:00");

  it("is three offsets from now: an hour, a day, a week", () => {
    expect(presets(now).map((p) => p.id)).toEqual(["hour", "day", "week"]);
  });

  it("the same three whatever the time of day", () => {
    // The clock-based presets had to be filtered as the day wore on, so the
    // list changed length depending on when it was opened.
    for (const hour of [0, 6, 12, 17, 18, 23]) {
      const t = at(`2026-10-24T${String(hour).padStart(2, "0")}:30:00`);
      expect(presets(t).map((p) => p.id), String(hour)).toEqual(["hour", "day", "week"]);
    }
  });

  it("lands exactly where it says", () => {
    const [h, d, w] = presets(now).map((p) => p.at.getTime() - now.getTime());
    expect(h).toBe(60 * 60 * 1000);
    expect(d).toBe(24 * 60 * 60 * 1000);
    expect(w).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("every one it offers is schedulable", () => {
    for (const p of presets(now)) expect(canSchedule(p.at, now), p.id).toBeNull();
  });
});

describe("canSchedule", () => {
  const now = at("2026-10-24T12:00:00");

  it("refuses the past", () => {
    expect(canSchedule(at("2026-10-24T11:59:00"), now)).toMatch(/further ahead/);
  });

  it("refuses a time inside the lead, and accepts one just past it", () => {
    // Matches scheduled_message_limits() in 0166; if the two disagree the
    // sheet offers something the database rejects.
    expect(canSchedule(new Date(now.getTime() + MIN_LEAD_MS - 1000), now)).not.toBeNull();
    expect(canSchedule(new Date(now.getTime() + MIN_LEAD_MS + 1000), now)).toBeNull();
  });

  it("refuses beyond 90 days, and accepts just inside", () => {
    expect(canSchedule(new Date(now.getTime() + MAX_AHEAD_MS + 60_000), now)).toMatch(/90 days/);
    expect(canSchedule(new Date(now.getTime() + MAX_AHEAD_MS - 60_000), now)).toBeNull();
  });

  it("refuses nothing and nonsense rather than throwing", () => {
    expect(canSchedule(null, now)).not.toBeNull();
    expect(canSchedule(new Date("not a date"), now)).not.toBeNull();
  });
});

describe("describeWhen", () => {
  const now = at("2026-10-24T12:00:00");

  it("names today and tomorrow instead of dating them", () => {
    expect(describeWhen(at("2026-10-24T18:00:00"), now)).toMatch(/^Today at /);
    expect(describeWhen(at("2026-10-25T09:00:00"), now)).toMatch(/^Tomorrow at /);
  });

  it("dates anything further out", () => {
    const s = describeWhen(at("2026-11-02T09:00:00"), now);
    expect(s).not.toMatch(/Today|Tomorrow/);
    expect(s).toMatch(/at /);
  });

  it("does not call the same clock time on a later date 'today'", () => {
    // A same-day check on hours alone would say Today for next week.
    expect(describeWhen(at("2026-10-31T12:00:00"), now)).not.toMatch(/Today/);
  });
});

describe("the month grid", () => {
  const now = at("2026-10-24T12:00:00");

  it("is always six weeks, so the grid never changes height", () => {
    // A calendar that grows and shrinks as it is paged moves the buttons
    // under the thumb that is reaching for one.
    for (let n = 0; n < 4; n++) {
      expect(monthGrid(addMonths(now, n), now)).toHaveLength(42);
    }
  });

  it("starts on a Monday", () => {
    const first = monthGrid(now, now)[0].date;
    expect(first.getDay()).toBe(1);
  });

  it("covers the whole month it was asked for", () => {
    const cells = monthGrid(at("2026-10-01T00:00:00"), now);
    const days = cells.filter((c) => c.inMonth).map((c) => c.date.getDate());
    expect(days[0]).toBe(1);
    expect(days[days.length - 1]).toBe(31);
    expect(days).toHaveLength(31);
  });

  it("marks the borrowed days from either side as outside the month", () => {
    const cells = monthGrid(at("2026-10-01T00:00:00"), now);
    expect(cells[0].inMonth).toBe(false);
    expect(cells.some((c) => !c.inMonth)).toBe(true);
  });

  it("disables yesterday and allows today", () => {
    const cells = monthGrid(now, now);
    const today = cells.find((c) => c.today);
    expect(today?.disabled).toBe(false);
    const yesterday = cells.find((c) => c.date.getDate() === 23 && c.inMonth);
    expect(yesterday?.disabled).toBe(true);
  });

  it("disables everything past the 90-day horizon", () => {
    // The same bound the database enforces, so the calendar cannot offer a
    // day that schedule_message would then refuse.
    const far = addMonths(now, 4);
    const cells = monthGrid(far, now);
    expect(cells.filter((c) => c.inMonth).every((c) => c.disabled)).toBe(true);
  });

  it("marks exactly one day as today, and only in the month containing it", () => {
    expect(monthGrid(now, now).filter((c) => c.today)).toHaveLength(1);
    expect(monthGrid(addMonths(now, 2), now).some((c) => c.today)).toBe(false);
  });

  it("handles February, including a leap year", () => {
    const feb = at("2028-02-01T00:00:00");
    const days = monthGrid(feb, feb).filter((c) => c.inMonth);
    expect(days).toHaveLength(29);
  });
});

describe("addMonths", () => {
  it("does not let the 31st spill into the month after next", () => {
    // setMonth on the 31st of January lands in March. Paging a calendar
    // that way skips February entirely.
    const jan31 = at("2026-01-31T12:00:00");
    expect(addMonths(jan31, 1).getMonth()).toBe(1);
  });

  it("crosses a year in both directions", () => {
    expect(addMonths(at("2026-12-15T00:00:00"), 1).getFullYear()).toBe(2027);
    expect(addMonths(at("2026-01-15T00:00:00"), -1).getFullYear()).toBe(2025);
  });
});

describe("monthInRange", () => {
  const now = at("2026-10-24T12:00:00");

  it("allows this month and refuses the one before", () => {
    expect(monthInRange(addMonths(now, 0), now)).toBe(true);
    expect(monthInRange(addMonths(now, -1), now)).toBe(false);
  });

  it("refuses months entirely past the horizon", () => {
    expect(monthInRange(addMonths(now, 1), now)).toBe(true);
    expect(monthInRange(addMonths(now, 6), now)).toBe(false);
  });
});

describe("the clock", () => {
  const now = at("2026-10-24T12:20:00");

  it("offers every hour on a future day", () => {
    const tomorrow = at("2026-10-25T00:00:00");
    expect(hourOptions(tomorrow, now).every((h) => !h.disabled)).toBe(true);
  });

  it("keeps the current hour while a later minute step is still ahead", () => {
    // 12:20 now — 12:30 and 12:45 are still available, so the 12 button
    // must not disappear.
    const today = at("2026-10-24T00:00:00");
    expect(hourOptions(today, now).find((h) => h.hour === 12)?.disabled).toBe(false);
  });

  it("drops hours that have wholly gone", () => {
    const today = at("2026-10-24T00:00:00");
    const hours = hourOptions(today, now);
    expect(hours.find((h) => h.hour === 9)?.disabled).toBe(true);
    expect(hours.find((h) => h.hour === 13)?.disabled).toBe(false);
  });

  it("disables only the minutes already past within the current hour", () => {
    const today = at("2026-10-24T00:00:00");
    const mins = minuteOptions(today, 12, now);
    expect(mins.find((m) => m.minute === 0)?.disabled).toBe(true);
    expect(mins.find((m) => m.minute === 15)?.disabled).toBe(true);
    expect(mins.find((m) => m.minute === 30)?.disabled).toBe(false);
    expect(mins.find((m) => m.minute === 45)?.disabled).toBe(false);
  });

  it("every enabled hour has at least one enabled minute", () => {
    // Otherwise an hour is pressable and then offers nothing.
    const today = at("2026-10-24T00:00:00");
    for (const h of hourOptions(today, now).filter((h) => !h.disabled)) {
      expect(minuteOptions(today, h.hour, now).some((m) => !m.disabled), String(h.hour)).toBe(true);
    }
  });

  it("withTime keeps the day and sets the clock exactly", () => {
    const d = withTime(at("2026-10-25T23:59:00"), 7, 15);
    expect(d.getDate()).toBe(25);
    expect(d.getHours()).toBe(7);
    expect(d.getMinutes()).toBe(15);
    expect(d.getSeconds()).toBe(0);
  });
});
