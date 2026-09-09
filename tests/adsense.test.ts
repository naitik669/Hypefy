import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadAdSense, resetAdSenseForTests, AD_BLOCKED } from "@/lib/adsense";

/**
 * The loader sits behind every ad slot in the feed, so the two things that
 * matter are that it fetches exactly once however many slots ask, and that a
 * blocked request comes back as a rejection rather than hanging — a slot that
 * never resolves either way is a permanently empty box.
 */

/** Fire the handler a real browser would fire, on the tag just inserted. */
function settle(how: "load" | "error") {
  const el = document.head.querySelector(
    'script[src*="adsbygoogle"]'
  ) as HTMLScriptElement | null;
  if (!el) throw new Error("no script tag was added");
  el.dispatchEvent(new Event(how));
  return el;
}

beforeEach(() => {
  resetAdSenseForTests();
  document.head.innerHTML = "";
});

describe("loadAdSense", () => {
  it("fetches once however many slots ask", async () => {
    // Two ads on a page is the normal case, and a second <script> would mean
    // a second copy of Google's runtime.
    const a = loadAdSense("ca-pub-1");
    const b = loadAdSense("ca-pub-1");
    const c = loadAdSense("ca-pub-1");
    expect(document.head.querySelectorAll("script")).toHaveLength(1);

    settle("load");
    await expect(Promise.all([a, b, c])).resolves.toBeDefined();
  });

  it("hands every caller the same promise", () => {
    expect(loadAdSense("ca-pub-1")).toBe(loadAdSense("ca-pub-1"));
  });

  it("carries the publisher id, url-encoded", () => {
    void loadAdSense("ca-pub-123");
    const el = document.head.querySelector("script") as HTMLScriptElement;
    expect(el.src).toContain("client=ca-pub-123");
    expect(el.async).toBe(true);
    expect(el.crossOrigin).toBe("anonymous");
  });

  it("rejects rather than hanging when the request is blocked", async () => {
    // The expected outcome for a large share of readers. It has to be a
    // rejection: a promise that never settles leaves a labelled empty box in
    // the middle of the feed with no house card to replace it.
    const p = loadAdSense("ca-pub-1");
    settle("error");
    await expect(p).rejects.toThrow(AD_BLOCKED);
  });

  it("resolves without a second tag when the script is already present", async () => {
    // A bfcache restore, or another surface that loaded it first.
    const existing = document.createElement("script");
    existing.src =
      "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1";
    document.head.appendChild(existing);

    await expect(loadAdSense("ca-pub-1")).resolves.toBeUndefined();
    expect(document.head.querySelectorAll("script")).toHaveLength(1);
  });

  it("does not retry a failure on its own", async () => {
    // Deliberate: an ad blocker will not change its mind, and retrying behind
    // every card would be a request storm for nothing. The card shows a house
    // ad instead, which is the better outcome anyway.
    const first = loadAdSense("ca-pub-1");
    settle("error");
    await expect(first).rejects.toThrow();

    await expect(loadAdSense("ca-pub-1")).rejects.toThrow();
    expect(document.head.querySelectorAll("script")).toHaveLength(1);
  });
});

describe("adTest", () => {
  it("only asks for test creatives when explicitly switched on", async () => {
    const prev = process.env.NEXT_PUBLIC_ADS_TEST;
    try {
      vi.resetModules();
      delete process.env.NEXT_PUBLIC_ADS_TEST;
      expect((await import("@/lib/ads")).adTest()).toBe(false);

      vi.resetModules();
      process.env.NEXT_PUBLIC_ADS_TEST = "1";
      expect((await import("@/lib/ads")).adTest()).toBe(true);

      // Anything else is off. A truthy-string check here would turn
      // NEXT_PUBLIC_ADS_TEST=false into test mode.
      vi.resetModules();
      process.env.NEXT_PUBLIC_ADS_TEST = "false";
      expect((await import("@/lib/ads")).adTest()).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_ADS_TEST;
      else process.env.NEXT_PUBLIC_ADS_TEST = prev;
    }
  });
});
