import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The chrome stays pinned, and the top bar gets out of the way.
 *
 * Two complaints, one about each end of the scroll. At the very top and the
 * very bottom the document rubber-banded and the chrome went with it — the
 * top bar rode the stretch down because it is sticky, and the bottom nav
 * lifted off the foot of the screen. And going down a long feed the bar sat
 * there taking a row of the screen with nothing to say.
 *
 * The rules themselves moved into src/lib/use-hide-on-scroll.ts when every
 * other header started hiding too, so the guarantees below are read from
 * the hook; what is left in HideOnScroll is the sticky wrapper Home needs
 * because its bar is a server component. See headers-hide-on-scroll.test.ts.
 */

const css = readFileSync("src/app/globals.css", "utf8").replace(/\r\n/g, "\n");
const hide = readFileSync("src/components/layout/HideOnScroll.tsx", "utf8").replace(/\r\n/g, "\n");
const hook = readFileSync("src/lib/use-hide-on-scroll.ts", "utf8").replace(/\r\n/g, "\n");
const bar = readFileSync("src/components/layout/TopBar.tsx", "utf8").replace(/\r\n/g, "\n");
const home = readFileSync("src/app/(app)/home/page.tsx", "utf8").replace(/\r\n/g, "\n");
const ptr = readFileSync("src/components/ui/PullToRefresh.tsx", "utf8").replace(/\r\n/g, "\n");
const nav = readFileSync("src/components/layout/BottomNav.tsx", "utf8").replace(/\r\n/g, "\n");

describe("neither end stretches", () => {
  it("the document does not rubber-band", () => {
    expect(css).toContain("overscroll-behavior-y: none;");
  });

  it("and the bottom nav is pinned to the screen, not to the page", () => {
    // Fixed rather than sticky: a sticky footer sits in the scroll flow and
    // travels with whatever the flow does.
    expect(nav).toContain("fixed inset-x-0 bottom-0");
  });

  it("pull-to-refresh never used the native bounce, so it still works", () => {
    // It reads scrollY and the touchmove delta and draws its own rubber
    // band. If it had leaned on the browser's, turning the bounce off would
    // have taken the refresh with it on five screens.
    expect(ptr).toContain("window.scrollY");
    expect(ptr).toContain("onTouchMove");
    expect(ptr).not.toContain("overscroll");
  });
});

describe("the top bar gets out of the way", () => {
  it("the wrapper is what sticks, not the bar", () => {
    // Sticky on both would pin the inner one to the outer one and move
    // nothing at all.
    expect(hide).toContain("sticky top-0 z-20");
    // The class, not the word: the comment in TopBar explaining why it no
    // longer sticks says "sticky" too.
    expect(bar).not.toContain("sticky top-0");
    expect(bar).not.toMatch(/className="[^"]*\bsticky\b/);
  });

  it("and the bar is inside it on Home", () => {
    expect(home).toContain("<HideOnScroll>");
    expect(home.indexOf("<HideOnScroll>")).toBeLessThan(home.indexOf("<TopBar />"));
  });

  it("goes up on the way down and comes back on the way up", () => {
    expect(hook).toContain("else if (dy > DOWN) setHidden(true);");
    expect(hook).toContain("else if (dy < -UP) setHidden(false);");
    expect(hook).toContain('transform: hidden ? "translateY(-100%)" : "translateY(0)"');
  });

  it("coming back takes less movement than going away", () => {
    // Somebody reaching for the bar flicks rather than scrolls, and a bar
    // that needs a long drag to return feels stuck.
    const down = Number(hook.match(/const DOWN = (\d+);/)?.[1]);
    const up = Number(hook.match(/const UP = (\d+);/)?.[1]);
    expect(up).toBeGreaterThan(0);
    expect(up).toBeLessThan(down);
  });

  it("near the top it is always shown, whichever way you were going", () => {
    // That is where pull-to-refresh lives, and where the bar is least in
    // the way.
    expect(hook).toContain("if (y <= FREE_ZONE) setHidden(false);");
    const order = hook.indexOf("if (y <= FREE_ZONE)");
    expect(order).toBeLessThan(hook.indexOf("else if (dy > DOWN)"));
  });

  it("reads the scroll on a frame rather than on every event", () => {
    // Reading scrollY inside the listener is a layout request per event,
    // which on a long feed shows up as jank.
    expect(hook).toContain("requestAnimationFrame(read)");
    expect(hook).toContain('{ passive: true }');
  });

  it("and cleans up after itself", () => {
    expect(hook).toContain('window.removeEventListener("scroll", onScroll)');
    expect(hook).toContain("cancelAnimationFrame");
  });

  it("with the slide skipped for anyone who asked for less motion", () => {
    expect(hide).toContain("motion-reduce:transition-none");
  });
});
