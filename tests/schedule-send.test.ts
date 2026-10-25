import { describe, it, expect } from "vitest";
import {
  MAX_AHEAD_MS,
  MIN_LEAD_MS,
  canSchedule,
  describeWhen,
  clampTime,
  clampWithinMeridiem,
  from12h,
  hour12Options,
  meridiemOptions,
  to12h,
  dayFromOffset,
  dayOptions,
  hourOptions,
  minuteOptions,
  minuteValues,
  sameDay,
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

describe("the day drum", () => {
  const now = at("2026-10-24T12:00:00");

  it("runs from today to the horizon and no further", () => {
    const days = dayOptions(now);
    expect(days[0].label).toBe("Today");
    expect(days[1].label).toBe("Tomorrow");
    // 90 days ahead, inclusive of today; the ninetieth may fall outside the
    // horizon depending on the time of day, so it is 90 or 91, never more.
    expect(days.length).toBeGreaterThanOrEqual(90);
    expect(days.length).toBeLessThanOrEqual(91);
  });

  it("keeps today while any of it is left, even one slot", () => {
    // At 23:50 the only time still ahead is 11:55 pm, and it is a real
    // choice — hiding it would remove a time somebody might want. This is
    // what looked broken in the picker, and the answer was the two-step
    // flow, not dropping the option.
    const late = at("2026-10-25T23:50:00");
    expect(dayOptions(late)[0].label).toBe("Today");
    expect(minuteValues(dayFromOffset(0, late), 23, late)).toEqual([55]);
  });

  it("drops today once nothing is left of it", () => {
    const tooLate = at("2026-10-25T23:58:00");
    expect(dayOptions(tooLate)[0].label).toBe("Tomorrow");
  });

  it("never offers a day with nothing on it, at any hour", () => {
    // The earlier version of this test only ran at midday, which is exactly
    // when both ends of the range happen to be healthy.
    for (const hour of [0, 6, 9, 12, 17, 22, 23]) {
      for (const minute of [0, 30, 50, 58]) {
        const t = at(`2026-10-25T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`);
        const days = dayOptions(t);
        expect(days.length, `${hour}:${minute}`).toBeGreaterThan(0);
        for (const d of days) {
          expect(hourOptions(d.date, t).length, `${hour}:${minute} ${d.label}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("names only the two days that need naming", () => {
    const labels = dayOptions(now).map((d) => d.label);
    expect(labels.filter((l) => l === "Today" || l === "Tomorrow")).toHaveLength(2);
    expect(labels[2]).toMatch(/\d/);
  });

  it("and the last day it offers is inside the horizon", () => {
    // The horizon is counted in hours from now, the drum in whole days, so
    // the far end is the other place a dead row can appear.
    const days = dayOptions(now);
    const last = days[days.length - 1];
    expect(hourOptions(last.date, now).length).toBeGreaterThan(0);
  });

  it("offsets resolve to the day they name", () => {
    expect(sameDay(dayFromOffset(0, now), now)).toBe(true);
    expect(dayFromOffset(1, now).getDate()).toBe(25);
    expect(dayFromOffset(8, now).getMonth()).toBe(10); // into November
  });

  it("crosses a month and a year end", () => {
    const dec = at("2026-12-30T12:00:00");
    expect(dayFromOffset(3, dec).getFullYear()).toBe(2027);
    expect(dayFromOffset(3, dec).getDate()).toBe(2);
  });
});

describe("the hour and minute drums", () => {
  const now = at("2026-10-24T12:20:00");
  const today = dayFromOffset(0, now);
  const tomorrow = dayFromOffset(1, now);

  it("a future day offers all twenty-four hours", () => {
    expect(hourOptions(tomorrow, now)).toHaveLength(24);
  });

  it("today offers only the hours still ahead", () => {
    const hours = hourOptions(today, now).map((h) => h.value);
    expect(hours).not.toContain(9);
    expect(hours).toContain(13);
  });

  it("keeps the current hour while a later step within it is still ahead", () => {
    // 12:20 now, so 12:25 onwards is fine — the 12 row must not disappear.
    expect(hourOptions(today, now).map((h) => h.value)).toContain(12);
  });

  it("drops the minutes already gone in the current hour", () => {
    const mins = minuteValues(today, 12, now);
    expect(mins).not.toContain(0);
    expect(mins).not.toContain(15);
    expect(mins).toContain(25);
    expect(mins[mins.length - 1]).toBe(55);
  });

  it("offers a full set of steps on a future hour", () => {
    expect(minuteValues(tomorrow, 9, now)).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
  });

  it("every hour it offers has at least one minute behind it", () => {
    // Otherwise a row is selectable and then offers nothing.
    for (const h of hourOptions(today, now)) {
      expect(minuteValues(today, h.value, now).length, String(h.value)).toBeGreaterThan(0);
    }
  });

  it("labels are zero-padded, so the column does not jitter", () => {
    expect(hourOptions(tomorrow, now)[0].label).toBe("00");
    expect(minuteOptions(tomorrow, 9, now)[1].label).toBe("05");
  });
});

describe("clampTime", () => {
  const now = at("2026-10-24T12:20:00");
  const today = dayFromOffset(0, now);
  const tomorrow = dayFromOffset(1, now);

  it("pulls a stranded time forward when the day moves to today", () => {
    // 09:00 is fine tomorrow and gone today. Moving the day drum must not
    // leave the clock showing a time the Send button would refuse.
    const fixed = clampTime(today, 9, 0, now);
    expect(canSchedule(withTime(today, fixed.hour, fixed.minute), now)).toBeNull();
  });

  it("leaves a time that is still fine exactly alone", () => {
    expect(clampTime(today, 18, 30, now)).toEqual({ hour: 18, minute: 30 });
    expect(clampTime(tomorrow, 9, 0, now)).toEqual({ hour: 9, minute: 0 });
  });

  it("keeps the hour and moves only the minute where it can", () => {
    // 12:00 has gone but 12:25 has not, so the hour should survive.
    expect(clampTime(today, 12, 0, now).hour).toBe(12);
  });

  it("always lands on something schedulable", () => {
    for (let h = 0; h < 24; h++) {
      for (const m of [0, 25, 55]) {
        const fixed = clampTime(today, h, m, now);
        expect(canSchedule(withTime(today, fixed.hour, fixed.minute), now), `${h}:${m}`).toBeNull();
      }
    }
  });
});

describe("twelve-hour time", () => {
  it("midnight is 12 AM and noon is 12 PM, not zero of either", () => {
    // `hour % 12` gives 0 for both, and "0 AM" is not a time anybody reads.
    // This pair is where every twelve-hour bug lives.
    expect(to12h(0)).toEqual({ hour12: 12, meridiem: "AM" });
    expect(to12h(12)).toEqual({ hour12: 12, meridiem: "PM" });
  });

  it("reads the rest of the clock the way a clock does", () => {
    expect(to12h(1)).toEqual({ hour12: 1, meridiem: "AM" });
    expect(to12h(11)).toEqual({ hour12: 11, meridiem: "AM" });
    expect(to12h(13)).toEqual({ hour12: 1, meridiem: "PM" });
    expect(to12h(23)).toEqual({ hour12: 11, meridiem: "PM" });
  });

  it("round-trips every hour of the day", () => {
    // The real guarantee: no hour may be lost or aliased onto another.
    for (let h = 0; h < 24; h++) {
      const { hour12, meridiem } = to12h(h);
      expect(from12h(hour12, meridiem), String(h)).toBe(h);
    }
  });

  it("from12h handles the two that are not a simple offset", () => {
    expect(from12h(12, "AM")).toBe(0);
    expect(from12h(12, "PM")).toBe(12);
  });
});

describe("the AM/PM drum", () => {
  const today = (iso: string) => dayFromOffset(0, at(iso));

  it("a future day offers both halves", () => {
    const now = at("2026-10-24T12:20:00");
    expect(meridiemOptions(dayFromOffset(1, now), now).map((m) => m.label)).toEqual(["AM", "PM"]);
  });

  it("drops AM once the morning has gone", () => {
    // Offering it would put a row under the band that resolves to nothing.
    const now = at("2026-10-24T14:00:00");
    expect(meridiemOptions(today("2026-10-24T14:00:00"), now).map((m) => m.label)).toEqual(["PM"]);
  });

  it("still offers AM in the morning, including the current hour", () => {
    const now = at("2026-10-24T11:50:00");
    const opts = meridiemOptions(today("2026-10-24T11:50:00"), now);
    expect(opts.map((m) => m.label)).toEqual(["AM", "PM"]);
    // 11:55 is still ahead, so 11 AM survives.
    expect(hour12Options(today("2026-10-24T11:50:00"), "AM", now).map((o) => o.value)).toEqual([11]);
  });

  it("orders the hour drum like a clock face: 12 first, then 1", () => {
    const now = at("2026-10-24T12:20:00");
    const pm = hour12Options(dayFromOffset(1, now), "PM", now).map((o) => o.value);
    expect(pm).toEqual([12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("late at night only the last hour survives, as PM", () => {
    const now = at("2026-10-24T23:50:00");
    const day = today("2026-10-24T23:50:00");
    expect(meridiemOptions(day, now).map((m) => m.label)).toEqual(["PM"]);
    expect(hour12Options(day, "PM", now).map((o) => o.value)).toEqual([11]);
  });

  it("every hour either drum offers has a minute behind it", () => {
    const now = at("2026-10-24T12:20:00");
    const day = today("2026-10-24T12:20:00");
    for (const m of meridiemOptions(day, now)) {
      const meridiem = m.label as "AM" | "PM";
      for (const h of hour12Options(day, meridiem, now)) {
        expect(minuteValues(day, from12h(h.value, meridiem), now).length, `${h.value}${meridiem}`)
          .toBeGreaterThan(0);
      }
    }
  });
});

describe("clampWithinMeridiem", () => {
  const now = at("2026-10-24T12:20:00");
  const today = dayFromOffset(0, now);
  const tomorrow = dayFromOffset(1, now);

  it("stays in the half of the day it was put in", () => {
    // clampTime alone falls back to the first valid hour of the whole day,
    // which would flip the meridiem the reader just set.
    const fixed = clampWithinMeridiem(tomorrow, 3, "AM", 0, now);
    expect(to12h(fixed!.hour).meridiem).toBe("AM");
    expect(fixed!.hour).toBe(3);
  });

  it("moves within that half when the exact hour has gone", () => {
    // 12 PM has passed at 12:20 only for :00 and :15; :25 is still fine, so
    // the hour survives and only the minute moves.
    const fixed = clampWithinMeridiem(today, 12, "PM", 0, now);
    expect(fixed!.hour).toBe(12);
    expect(fixed!.minute).toBe(25);
  });

  it("always lands on something schedulable", () => {
    for (const meridiem of ["AM", "PM"] as const) {
      for (const h12 of [12, 1, 6, 11]) {
        const fixed = clampWithinMeridiem(today, h12, meridiem, 0, now);
        if (!fixed) continue;
        expect(canSchedule(withTime(today, fixed.hour, fixed.minute), now), `${h12}${meridiem}`)
          .toBeNull();
      }
    }
  });

  it("answers null for a half of the day with nothing left", () => {
    const late = at("2026-10-24T23:50:00");
    expect(clampWithinMeridiem(dayFromOffset(0, late), 3, "AM", 0, late)).toBeNull();
  });
});
