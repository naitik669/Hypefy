import { describe, it, expect } from "vitest";
import { REEL, reelCentre, reelHeight, reelMax, turnReel } from "@/components/layout/AccountSwitchPad";

/**
 * Holding the profile tab with more accounts than fit: the list is a reel the
 * thumb turns by pushing up past the top face, and "+" waits past its end.
 */
describe("the account switch reel", () => {
  it("shows four faces, and turns only when there are more", () => {
    expect(reelHeight(9)).toBe(reelHeight(4));
    expect(reelMax(4)).toBe(0);
    expect(reelMax(9)).toBe(5 * REEL.PITCH);
  });

  it("brings the next account down for every 20px the thumb goes up", () => {
    const { scroll } = turnReel({ scroll: 0, push: 0 }, 20, 9);
    expect(scroll).toBe(REEL.PITCH);
    // Account 4 now sits where account 3 was: the top of the view.
    expect(reelCentre(4, scroll)).toBe(reelCentre(3, 0));
  });

  it("stops at the end of the list and banks the rest as a push to +", () => {
    const end = turnReel({ scroll: 0, push: 0 }, 130, 9);
    expect(end.scroll).toBe(reelMax(9));
    expect(end.push).toBe(30);
    expect(end.push).toBeGreaterThan(REEL.ADD_PUSH);
  });

  it("with few accounts, going up is all push to +", () => {
    expect(turnReel({ scroll: 0, push: 0 }, 30, 2)).toEqual({ scroll: 0, push: 30 });
  });

  it("coming back down leaves + before turning the reel back", () => {
    const back = turnReel({ scroll: reelMax(9), push: 30 }, -40, 9);
    expect(back.push).toBe(0);
    expect(back.scroll).toBe(reelMax(9) - 10 * REEL.RATIO);
  });

  it("never turns past the first account", () => {
    expect(turnReel({ scroll: 30, push: 0 }, -100, 9).scroll).toBe(0);
  });
});
