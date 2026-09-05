import { describe, it, expect } from "vitest";
import { ageFrom } from "@/components/auth/AgeCheck";

/**
 * The client-side age arithmetic. The real gate is set_date_of_birth in
 * migration 0053, which rejects under-13 in the database — this only decides
 * whether the button is enabled, so the cases that matter are the boundary
 * ones, where an off-by-one shows someone the wrong message.
 */
describe("ageFrom", () => {
  const today = new Date("2026-09-05T12:00:00Z");

  it("counts whole years", () => {
    expect(ageFrom("2000-09-05", today)).toBe(26);
    expect(ageFrom("1990-01-01", today)).toBe(36);
  });

  it("does not round up a birthday that has not happened yet this year", () => {
    // One day short of 13: still 12, and must not be let through.
    expect(ageFrom("2013-09-06", today)).toBe(12);
    // On the birthday itself: 13.
    expect(ageFrom("2013-09-05", today)).toBe(13);
    // The day after: still 13.
    expect(ageFrom("2013-09-04", today)).toBe(13);
  });

  it("handles an earlier month in the same year", () => {
    expect(ageFrom("2013-12-31", today)).toBe(12);
    expect(ageFrom("2013-01-01", today)).toBe(13);
  });

  it("returns null rather than NaN for junk", () => {
    expect(ageFrom("")).toBeNull();
    expect(ageFrom("not-a-date")).toBeNull();
    expect(ageFrom("2013-13-45")).toBeNull();
  });
});
