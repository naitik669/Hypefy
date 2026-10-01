import { describe, it, expect } from "vitest";
import { REEL, reelCentre, reelHeight, reelMax, reelRatio, turnReel } from "@/components/layout/AccountSwitchPad";

/**
 * Holding the profile tab with more accounts than fit: the list is a reel the
 * thumb turns by pushing up past the top face, and "+" waits past its end.
 *
 * How fast it turns is the part worth pinning down. The thumb only has the
 * few inches between the tab and the top of its travel, so a long list has to
 * come faster than a short one or reaching the last account is a haul.
 */
describe("the account switch reel", () => {
  it("shows four faces, and turns only when there are more", () => {
    expect(reelHeight(9)).toBe(reelHeight(4));
    expect(reelMax(4)).toBe(0);
    expect(reelMax(9)).toBe(5 * REEL.PITCH);
  });

  it("brings the next account down for every 20px the thumb goes up, on a short list", () => {
    const { scroll } = turnReel({ scroll: 0, push: 0 }, 20, 5);
    expect(scroll).toBe(REEL.PITCH);
    // Account 4 now sits where account 3 was: the top of the view.
    expect(reelCentre(4, scroll)).toBe(reelCentre(3, 0));
  });

  it("turns faster the longer the list, up to a ceiling", () => {
    // A list one longer than the view keeps exactly the old feel.
    expect(reelRatio(5)).toBe(REEL.RATIO);
    expect(reelRatio(7)).toBeGreaterThan(reelRatio(5));
    expect(reelRatio(10)).toBeGreaterThan(reelRatio(7));
    // And stops there, because past it the faces are a blur, not faces.
    expect(reelRatio(11)).toBe(REEL.RATIO_MAX);
    expect(reelRatio(40)).toBe(REEL.RATIO_MAX);
  });

  it("asks less of the thumb per account when there are more of them", () => {
    const perAccount = (n: number) => REEL.PITCH / reelRatio(n);
    expect(perAccount(10)).toBeLessThan(perAccount(5) / 1.5);
    // The whole list is within reach either way.
    expect(reelMax(10) / reelRatio(10)).toBeLessThan(reelMax(10) / REEL.RATIO);
  });

  it("never turns for a list that fits, whatever its ratio would be", () => {
    expect(turnReel({ scroll: 0, push: 0 }, 30, 2)).toEqual({ scroll: 0, push: 30 });
    expect(turnReel({ scroll: 0, push: 0 }, 30, 4)).toEqual({ scroll: 0, push: 30 });
  });

  it("stops at the end of the list and banks the rest as a push to +", () => {
    const end = turnReel({ scroll: 0, push: 0 }, 130, 9);
    expect(end.scroll).toBe(reelMax(9));
    expect(end.push).toBe(130 - reelMax(9) / reelRatio(9));
    expect(end.push).toBeGreaterThan(REEL.ADD_PUSH);
  });

  it("coming back down leaves + before turning the reel back", () => {
    const back = turnReel({ scroll: reelMax(9), push: 30 }, -40, 9);
    expect(back.push).toBe(0);
    expect(back.scroll).toBe(reelMax(9) - 10 * reelRatio(9));
  });

  it("never turns past the first account", () => {
    expect(turnReel({ scroll: 30, push: 0 }, -100, 9).scroll).toBe(0);
  });

  it("gives back exactly what it took, however fast it turns", () => {
    for (const n of [5, 7, 12]) {
      const up = turnReel({ scroll: 0, push: 0 }, 40, n);
      const down = turnReel(up, -40, n);
      expect(down).toEqual({ scroll: 0, push: 0 });
    }
  });
});
