// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  NO_GHOST,
  feedName,
  ghostError,
  ghostLeft,
  limitHeadline,
  needsFullExplanation,
  noteExplained,
  resetDay,
  toGhostStatus,
} from "@/lib/ghost-share";

describe("Ghost Share: the sender's rules and words", () => {
  beforeEach(() => localStorage.clear());

  it("reads the status the database gives, as a row or a list of one", () => {
    const row = { can: true, used: 1, allowed: 2, resets_at: "2026-10-11T18:30:00Z" };
    const want = { can: true, used: 1, allowed: 2, resetsAt: "2026-10-11T18:30:00Z" };
    expect(toGhostStatus([row])).toEqual(want);
    expect(toGhostStatus(row)).toEqual(want);
  });

  it("offers nothing when there is no answer", () => {
    expect(toGhostStatus(null)).toEqual(NO_GHOST);
    expect(toGhostStatus([])).toEqual(NO_GHOST);
    expect(NO_GHOST.can).toBe(false);
  });

  it("counts what is left, and never below none", () => {
    expect(ghostLeft({ can: true, used: 0, allowed: 2, resetsAt: null })).toBe(2);
    expect(ghostLeft({ can: true, used: 2, allowed: 2, resetsAt: null })).toBe(0);
    // Premium lapsed mid-week: five used against an allowance of two.
    expect(ghostLeft({ can: true, used: 5, allowed: 2, resetsAt: null })).toBe(0);
  });

  it("names the feed it will turn up in", () => {
    expect(feedName("shot")).toBe("Shots");
    expect(feedName("post")).toBe("their home feed");
  });

  it("says both for two and the number for more", () => {
    expect(limitHeadline(2)).toBe("That's both for this week");
    expect(limitHeadline(5)).toBe("That's all 5 for this week");
  });

  it("names the day they come back, and does not guess without one", () => {
    expect(resetDay("2026-10-12T12:00:00Z", "en-GB")).toBe("Monday");
    expect(resetDay(null)).toBe("next week");
    expect(resetDay("nonsense")).toBe("next week");
  });

  it("explains in full three times, then gets shorter", () => {
    expect(needsFullExplanation()).toBe(true);
    noteExplained();
    noteExplained();
    expect(needsFullExplanation()).toBe(true);
    noteExplained();
    expect(needsFullExplanation()).toBe(false);
  });

  it("repeats what the database meant to be read, and nothing else it says", () => {
    expect(ghostError("You've used your Ghost Shares for this week")).toBe("You've used your Ghost Shares for this week");
    expect(ghostError("P0001: Already this week")).toBe("Already this week");
    expect(ghostError('duplicate key value violates unique constraint "ghost_shares_pair_week"')).toBe(
      "Couldn't place that. Try again.",
    );
    expect(ghostError(null)).toBe("Couldn't place that. Try again.");
  });
});
