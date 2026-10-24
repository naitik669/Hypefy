import { describe, it, expect } from "vitest";
import {
  MAX_AHEAD_MS,
  MIN_LEAD_MS,
  canSchedule,
  describeWhen,
  fromLocalInput,
  nextAt,
  presets,
  toLocalInput,
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

describe("nextAt", () => {
  it("is later today when the hour has not come yet", () => {
    const now = at("2026-10-24T14:00:00");
    expect(nextAt(18, now).toISOString()).toBe(at("2026-10-24T18:00:00").toISOString());
  });

  it("rolls to tomorrow once it has", () => {
    const now = at("2026-10-24T19:30:00");
    expect(nextAt(18, now).getDate()).toBe(25);
  });

  it("treats the hour exactly striking as gone", () => {
    // 9am generated at 9am sharp means tomorrow: "9am" has happened.
    const now = at("2026-10-24T09:00:00");
    expect(nextAt(9, now).getDate()).toBe(25);
  });

  it("crosses a month end", () => {
    const now = at("2026-10-31T23:30:00");
    const d = nextAt(9, now);
    expect(d.getMonth()).toBe(10); // November
    expect(d.getDate()).toBe(1);
  });

  it("crosses a year end", () => {
    const now = at("2026-12-31T23:45:00");
    const d = nextAt(9, now);
    expect(d.getFullYear()).toBe(2027);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(1);
  });
});

describe("presets", () => {
  it("drops 'this evening' once the evening has started", () => {
    // A label that has stopped being true is worse than one fewer preset.
    const ids = presets(at("2026-10-24T20:00:00")).map((p) => p.id);
    expect(ids).not.toContain("evening");
    expect(ids).toContain("tomorrow");
  });

  it("offers it in the afternoon", () => {
    expect(presets(at("2026-10-24T13:00:00")).map((p) => p.id)).toContain("evening");
  });

  it("drops it when it is too close to be worth offering", () => {
    // 17:45 — "this evening" would mean fifteen minutes from now, which is
    // not what anybody means by it.
    expect(presets(at("2026-10-24T17:45:00")).map((p) => p.id)).not.toContain("evening");
  });

  it("every preset it returns is actually schedulable", () => {
    // Offering a preset the database would refuse is the one thing this
    // list must never do.
    for (const hour of [0, 3, 8, 11, 15, 17, 18, 21, 23]) {
      const now = at(`2026-10-24T${String(hour).padStart(2, "0")}:30:00`);
      for (const p of presets(now)) {
        expect(canSchedule(p.at, now), `${p.id} at ${hour}:30`).toBeNull();
      }
    }
  });

  it("always offers at least one", () => {
    for (const hour of [0, 6, 12, 18, 23]) {
      const now = at(`2026-10-24T${String(hour).padStart(2, "0")}:30:00`);
      expect(presets(now).length, String(hour)).toBeGreaterThan(0);
    }
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

describe("the datetime-local round trip", () => {
  it("writes the local clock, not UTC", () => {
    // toISOString would show the wrong time to anybody off GMT, and then
    // read that wrong time back as the intended one.
    const d = at("2026-10-24T18:45:00");
    expect(toLocalInput(d)).toBe("2026-10-24T18:45");
  });

  it("pads every field", () => {
    expect(toLocalInput(at("2026-01-02T03:04:00"))).toBe("2026-01-02T03:04");
  });

  it("survives the round trip", () => {
    const d = at("2026-03-09T07:05:00");
    expect(fromLocalInput(toLocalInput(d))?.getTime()).toBe(d.getTime());
  });

  it("reads a half-typed or empty value as nothing, never Invalid Date", () => {
    for (const bad of ["", "2026-10-24", "2026-10-24T", "nonsense", "2026-13-45T99:99"]) {
      const parsed = fromLocalInput(bad);
      expect(parsed === null || !Number.isNaN(parsed.getTime()), bad).toBe(true);
    }
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
