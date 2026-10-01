import { describe, it, expect } from "vitest";
import { shotStage } from "@/components/shots/ReelsFeed";

/**
 * Opening the comments made the Shot slide in from the right. The centring
 * was part of the same transform as the pinch, and that transform is
 * transitioned so the pinch can glide back — so the centring was animated
 * too. These say the transform now carries the pinch and nothing else.
 */
describe("the Shot's stage while the comments are up", () => {
  it("carries no transform at rest, with or without the comments", () => {
    expect(shotStage(false, 1).transform).toBeUndefined();
    expect(shotStage(true, 1).transform).toBeUndefined();
  });

  it("centres with left, not with a translate", () => {
    const open = shotStage(true, 1);
    expect(open.left).toContain("50%");
    expect(open.transform ?? "").not.toContain("translate");
  });

  it("stays full-screen with no size of its own while the comments are shut", () => {
    const shut = shotStage(false, 1);
    expect(shut.height).toBeUndefined();
    expect(shut.width).toBeUndefined();
    expect(shut.left).toBeUndefined();
  });

  it("is a 9:16 box: the left edge is half that width back from the middle", () => {
    const open = shotStage(true, 1);
    // width = H * 9/16, so half of it is H * 9/32.
    expect(open.width).toBe("calc(max(var(--shot-sheet-top, 100dvh), 50dvh) * 9 / 16)");
    expect(open.left).toBe("calc(50% - max(var(--shot-sheet-top, 100dvh), 50dvh) * 9 / 32)");
  });

  it("never falls back to a percentage height, which a left calc cannot use", () => {
    // 100% as a width would be the container's width, not its height, and the
    // centring arithmetic would come out wrong for the one frame before the
    // sheet reports where its top edge is.
    expect(shotStage(true, 1).height).not.toContain("100%");
  });

  it("still glides the pinch back", () => {
    expect(shotStage(false, 1.4).transform).toBe("scale(1.4)");
    expect(shotStage(true, 1.4).transform).toBe("scale(1.4)");
  });
});
