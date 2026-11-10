import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The freeze, and being able to see it.
 *
 * Reported as "crashes/freezes completely after a few interactions" on
 * Android, mobile web and desktop. Three audits ruled out the server
 * (no runtime errors in 7 days), the database (INFO-level advisors
 * only), Supabase Realtime (all 17 channels balanced, client is a
 * singleton) and the service worker. What was left is unbounded
 * mounted DOM and unbounded live <video> elements — the signature of
 * something that is fine at first and dies after N interactions.
 *
 * These assertions are about counts staying bounded. That is the whole
 * fix, so that is what is pinned.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const reels = read("src/components/shots/ReelsFeed.tsx");
const feed = read("src/components/feed/FeedList.tsx");
const card = read("src/components/feed/FeedCard.tsx");
const reporter = read("src/components/pwa/ClientErrorReporter.tsx");
const relay = read("src/app/api/client-error/route.ts");
const callProvider = read("src/components/calls/CallProvider.tsx");
const groupCalls = read("src/components/calls/GroupCallProvider.tsx");

describe("a reel list no longer keeps every video alive", () => {
  it("slides outside the window are not mounted at all", () => {
    // Gating `preload` alone is not enough: the element and its
    // committed `src` still exist, and a committed src is a decoder.
    expect(reels).toContain("Math.abs(i - activeIdx) > SLIDE_WINDOW ? null : (");
  });

  it("the window is small enough to stay inside a WebView's decoder budget", () => {
    // Android allows roughly 6-16 concurrent decoders. Two either side
    // is five slides, which leaves headroom.
    const n = Number(reels.match(/const SLIDE_WINDOW = (\d+);/)?.[1]);
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(2);
  });

  it("and the neighbour buffering is untouched, because it was never the bug", () => {
    expect(reels).toContain('preload={Math.abs(i - activeIdx) <= 1 ? "auto" : "metadata"}');
  });
});

describe("the feed stops growing without bound", () => {
  it("appending trims from the head", () => {
    expect(feed).toContain(
      "return next.length > MAX_MOUNTED ? next.slice(next.length - MAX_MOUNTED) : next;",
    );
  });

  it("the cap is a real bound, not a number large enough to never hit", () => {
    const n = Number(feed.match(/const MAX_MOUNTED = (\d+);/)?.[1]);
    expect(n).toBeGreaterThanOrEqual(40);
    expect(n).toBeLessThanOrEqual(150);
  });

  it("content-visibility stays, because it does different work", () => {
    // It skips layout and paint. It does not skip reconciliation, and
    // it does not stop a card mounting its observers and listeners —
    // which is what the cap is for.
    // The applied class, not the word: three comments in this file
    // also say "content-visibility", and a mutation that stripped the
    // real one passed against a bare substring check.
    expect(feed.match(/\[content-visibility:auto\]/g) ?? []).toHaveLength(2);
  });
});

describe("two leaks that only bite when things go wrong", () => {
  it("a ring channel that never connects is still removed", () => {
    // The removal used to sit inside the SUBSCRIBED branch, so the
    // channel leaked on exactly the networks where ringing fails.
    for (const [name, src] of [
      ["CallProvider", callProvider],
      ["GroupCallProvider", groupCalls],
    ] as const) {
      expect(src, name).toContain('=== "CHANNEL_ERROR" || ');
      const guard = src.slice(src.indexOf('=== "CHANNEL_ERROR"'));
      expect(guard.slice(0, 200), name).toContain("removeChannel(ring)");
    }
  });

  it("and pinch listeners are released before any early return", () => {
    // These are non-passive touchmove listeners on window that call
    // preventDefault. Orphaning a set does not just leak — it stops
    // the page scrolling, which users read as a freeze.
    const fn = card.slice(card.indexOf("function endPinch()"), card.indexOf("lockPage(false)"));
    expect(fn.indexOf("stopTracking();")).toBeLessThan(fn.indexOf("if (!pinchFrom.current) return;"));
  });
});

describe("a freeze leaves a trace now", () => {
  it("the reporter watches for a blocked main thread", () => {
    // The two existing listeners cannot see this: a freeze throws no
    // error and rejects no promise, so the one symptom users actually
    // report left no trace anywhere.
    expect(reporter).toContain('observer.observe({ entryTypes: ["longtask"] })');
    expect(reporter).toContain("entry.duration >= LONG_TASK_MS");
  });

  it("and for a heap that only climbs", () => {
    expect(reporter).toContain("usedJSHeapSize");
    expect(reporter).toContain("rises = used > last ? rises + 1 : 0;");
    // One high reading is noise; a run of rises with no collection is
    // the leak.
    expect(reporter).toContain("if (rises >= RISES_BEFORE_REPORTING)");
  });

  it("every report carries the two counts this work is about", () => {
    expect(reporter).toContain('nodes: document.getElementsByTagName("*").length');
    expect(reporter).toContain('videos: document.getElementsByTagName("video").length');
  });

  it("health reports have their own budget, so they cannot drown the errors", () => {
    expect(reporter).toContain("if (health >= MAX_HEALTH_PER_SESSION) return;");
  });

  it("observing longtask does not break the browsers that lack it", () => {
    // Safari and older WebViews throw from observe().
    const block = reporter.slice(reporter.indexOf("let observer"), reporter.indexOf("let last = 0;"));
    expect(block).toContain("try {");
    expect(block).toContain("catch {");
  });

  it("and everything it starts is torn down", () => {
    const cleanup = reporter.slice(reporter.indexOf("return () => {"));
    expect(cleanup).toContain("observer?.disconnect();");
    expect(cleanup).toContain("window.clearInterval(timer);");
  });

  it("the relay keeps freezes separable from exceptions", () => {
    expect(relay).toContain('const KINDS = ["error", "unhandledrejection", "longtask", "memory"] as const;');
    expect(relay).toContain('const health = kind === "longtask" || kind === "memory";');
    expect(relay).toContain('level: health ? "warning" : "error",');
  });

  it("and an unknown kind cannot be injected as a tag", () => {
    expect(relay).toContain("KINDS.find((k) => k === body?.kind) ?? \"error\"");
  });
});
