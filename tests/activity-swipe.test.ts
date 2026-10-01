import { describe, it, expect } from "vitest";
import { settleTo, swipeTo } from "@/app/(app)/notifications/page";
import { lockAxis } from "@/components/layout/SwipeNav";

/**
 * Swiping a notification open, and reading past it.
 *
 * The two gestures live on top of each other — the list scrolls under the
 * same finger that drags a row — so the rules that keep them apart are worth
 * holding onto. Clearing is the one that cannot be undone.
 */

// What the Activity row uses: 80px per action, 110px to clear.
const REVEAL = 80;
const COMMIT = 110;

describe("swipeTo", () => {
  it("follows the finger leftwards", () => {
    expect(swipeTo(-40, 0, COMMIT)).toBe(-40);
    expect(swipeTo(-30, -50, COMMIT)).toBe(-80);
  });

  it("will not open to the right: the actions are on the left", () => {
    expect(swipeTo(60, 0, COMMIT)).toBe(0);
    // Pulling an open row back closes it and stops there.
    expect(swipeTo(200, -80, COMMIT)).toBe(0);
  });

  it("stops a little past the point of no return rather than following for ever", () => {
    expect(swipeTo(-900, 0, COMMIT)).toBe(-COMMIT - 20);
  });
});

describe("settleTo", () => {
  it("clears only when the row was carried the whole way", () => {
    expect(settleTo(-COMMIT, REVEAL, COMMIT)).toBe("clear");
    expect(settleTo(-COMMIT - 20, REVEAL, COMMIT)).toBe("clear");
    // A pixel short is not a clear — this one cannot be undone.
    expect(settleTo(-COMMIT + 1, REVEAL, COMMIT)).not.toBe("clear");
  });

  it("opens at the actions once it is pulled most of the way to them", () => {
    expect(settleTo(-REVEAL / 2, REVEAL, COMMIT)).toBe("open");
    expect(settleTo(-100, REVEAL, COMMIT)).toBe("open");
  });

  it("springs home from a nudge", () => {
    expect(settleTo(0, REVEAL, COMMIT)).toBe("closed");
    expect(settleTo(-REVEAL / 2 + 1, REVEAL, COMMIT)).toBe("closed");
  });
});

describe("which gesture a touch belongs to", () => {
  it("gives a read down the list to the list, not to the row", () => {
    // Reading: mostly vertical, with the wobble a thumb always has.
    expect(lockAxis(6, 40)).toBe("y");
    expect(lockAxis(-14, 60)).toBe("y");
  });

  it("gives a swipe for the actions to the row", () => {
    expect(lockAxis(-40, 6)).toBe("x");
    expect(lockAxis(-60, 20)).toBe("x");
  });

  it("waits while the gesture is still too small to call", () => {
    expect(lockAxis(4, 4)).toBeNull();
    expect(lockAxis(-9, 2)).toBeNull();
  });

  it("leans towards the list when it is close, since stealing a scroll is worse", () => {
    // Equal travel each way is the list's.
    expect(lockAxis(-30, 30)).toBe("y");
    expect(lockAxis(-40, 30)).toBe("y");
  });
});
