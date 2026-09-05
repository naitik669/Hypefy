import { describe, it, expect } from "vitest";
import { shouldFallBack } from "@/lib/safe-back";

/**
 * router.back() is a no-op when the current page is the first entry in the
 * session — which is exactly what a shared link produces. For ShowViewer that
 * was a trap rather than an annoyance: it covers the bottom nav, so back was
 * the only exit, and on Android the hardware button quit the app instead.
 */
describe("shouldFallBack", () => {
  it("falls back when the page is the only history entry", () => {
    // A cold open from a shared link.
    expect(shouldFallBack(1)).toBe(true);
  });

  it("falls back when the history length is somehow zero", () => {
    expect(shouldFallBack(0)).toBe(true);
  });

  it("goes back normally once there is somewhere to go", () => {
    expect(shouldFallBack(2)).toBe(false);
    expect(shouldFallBack(12)).toBe(false);
  });
});
