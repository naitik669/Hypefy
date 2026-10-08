// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { peekPhotoBox, peekCardBox } from "@/components/feed/PostPeek";

/**
 * Holding a post opens it at the photo's own shape, and at the same size
 * before and after the pixels arrive. Both halves of the bug were here: no
 * room was reserved, so the card grew on load, and a tall photo was
 * letterboxed inside a full-width box, so it read far smaller than a wide one.
 */

describe("the photo's box", () => {
  it("takes the post's shape", () => {
    expect(peekPhotoBox(1.778).aspectRatio).toBe("1.778");
    expect(peekPhotoBox(0.5625).aspectRatio).toBe("0.5625");
  });

  it("caps a tall post by width as well as height, so it is never letterboxed", () => {
    const tall = peekPhotoBox(0.5625);
    expect(tall.maxHeight).toBe("58vh");
    // 58vh * 0.5625: the width the capped height allows, so no bars.
    expect(tall.maxWidth).toBe("calc(58vh * 0.5625)");
  });

  it("leaves a wide post full width", () => {
    // 58vh * 1.778 is far wider than the card, so only w-full applies.
    expect(peekPhotoBox(1.778).maxWidth).toBe("calc(58vh * 1.778)");
  });

  it("falls back to a square for a post with no ratio, as the feed card does", () => {
    for (const bad of [null, undefined, 0, -1]) {
      expect(peekPhotoBox(bad as number | null).aspectRatio).toBe("1");
    }
  });

  it("takes the card in with a tall photo, and never past 440px", () => {
    expect(peekCardBox(0.5625).maxWidth).toBe("min(440px, calc(58vh * 0.5625))");
    expect(peekCardBox(1.778).maxWidth).toBe("min(440px, calc(58vh * 1.778))");
    expect(peekCardBox(null).maxWidth).toBe("min(440px, calc(58vh * 1))");
  });
});

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }),
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, refresh() {} }) }));
vi.mock("@/components/ui/ToastProvider", () => ({ useToast: () => () => {} }));

describe("the peek card", () => {
  let root: Root;
  let host: HTMLDivElement;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  async function open(aspectRatio: number | null) {
    const { PostPeek } = await import("@/components/feed/PostPeek");
    await act(async () =>
      root.render(
        createElement(PostPeek, {
          // A URL that never loads: the box must already be the right shape.
          src: "https://example.invalid/never.jpg",
          aspectRatio,
          postId: "p1",
          author: null,
          caption: "a photo",
          currentUserId: "u1",
          hyped: false,
          hypeCount: 0,
          commentCount: 0,
          saved: false,
          onHype() {},
          onComment() {},
          onShare() {},
          onSave() {},
          onClose() {},
        }),
      ),
    );
    return document.querySelector<HTMLElement>('[role="dialog"] [style*="aspect-ratio"]');
  }

  it("reserves the photo's shape before the image loads", async () => {
    const box = await open(0.5625);
    expect(box).not.toBeNull();
    expect(box!.style.aspectRatio).toBe("0.5625");
    expect(box!.style.maxHeight).toBe("58vh");
  });

  it("reserves a square when the post has no ratio", async () => {
    const box = await open(null);
    expect(box!.style.aspectRatio).toBe("1");
  });
});

/**
 * Design F: the media and five actions under it, spread across the width.
 * No author, no caption, no card — those were all on screen a moment ago.
 */
describe("the peek, design F", () => {
  let root: Root;
  let host: HTMLDivElement;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  async function open(extra: Record<string, unknown> = {}) {
    const { PostPeek } = await import("@/components/feed/PostPeek");
    await act(async () =>
      root.render(
        createElement(PostPeek, {
          src: "https://example.invalid/p.jpg",
          aspectRatio: 1,
          postId: "p1",
          caption: "golden hour on the roof",
          author: { id: "u2", name: "Maya Rao", username: "maya", avatarUrl: null, hue: 30, verified: false },
          hyped: false,
          hypeCount: 341,
          commentCount: 7,
          saved: false,
          rehyped: false,
          rehypeCount: 24,
          onRehype() {},
          onHype() {},
          onComment() {},
          onShare() {},
          onSave() {},
          onClose() {},
          ...extra,
        }),
      ),
    );
    return document.querySelector('[role="dialog"]') as HTMLElement;
  }

  it("draws neither the author nor the caption", async () => {
    const peek = await open();
    expect(peek.textContent).not.toContain("Maya");
    expect(peek.textContent).not.toContain("@maya");
    expect(peek.textContent).not.toContain("golden hour");
  });

  it("puts the five actions in one row under the media, with their counts", async () => {
    const peek = await open();
    const labels = ["Hype", "Comments", "Share", "Rehype", "Save"];
    const buttons = labels.map((l) => peek.querySelector(`[aria-label="${l}"]`) as HTMLElement);
    buttons.forEach((b, i) => expect(b, labels[i]).toBeTruthy());
    const row = buttons[0].parentElement!;
    // Share sits inside its hold-to-share wrapper, so "in the row", not "a child of it".
    expect(buttons.every((b) => row.contains(b))).toBe(true);
    expect(row.className).toContain("justify-between");
    expect(row.textContent).toContain("341");
    expect(row.textContent).toContain("7");
    expect(row.textContent).toContain("24");
  });

  it("has no card behind it", async () => {
    const peek = await open();
    // The wrapper around the media and the row is bare: no fill, no rounded card.
    const wrapper = peek.firstElementChild as HTMLElement;
    expect(wrapper.className).not.toMatch(/bg-|rounded-3xl|shadow/);
  });

  it("offers the message menu only where it is given one", async () => {
    let peek = await open();
    expect(peek.querySelector('[aria-label="More"]')).toBeFalsy();
    let more = 0;
    peek = await open({ onMore: () => more++ });
    const btn = peek.querySelector('[aria-label="More"]') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    await act(async () => btn.click());
    expect(more).toBe(1);
  });

  it("names itself after what it is showing", async () => {
    expect((await open()).getAttribute("aria-label")).toBe("Post preview");
    expect((await open({ targetType: "shot", videoSrc: "s.mp4" })).getAttribute("aria-label")).toBe("Shot preview");
  });
});

/**
 * A held Shot plays in the peek, and its sound is a tap away. It starts
 * silent: the card it was held open from may be playing the same Shot
 * underneath, and the browser wants a gesture before it makes any noise.
 */
describe("sound in a held Shot", () => {
  let root: Root;
  let host: HTMLDivElement;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  async function openShot(videoSrc?: string) {
    const { PostPeek } = await import("@/components/feed/PostPeek");
    await act(async () =>
      root.render(
        createElement(PostPeek, {
          src: "https://example.invalid/poster.jpg",
          videoSrc,
          aspectRatio: 0.5625,
          postId: "s1",
          targetType: "shot",
          caption: null,
          hyped: false,
          hypeCount: 0,
          commentCount: 0,
          saved: false,
          onHype() {},
          onComment() {},
          onShare() {},
          onSave() {},
          onClose() {},
        }),
      ),
    );
  }

  const button = () => document.querySelector<HTMLButtonElement>("[data-peek-mute]");
  const video = () => document.querySelector("video");

  it("starts silent, and says that tapping will unmute", async () => {
    await openShot("https://example.invalid/clip.mp4");
    expect(button()).not.toBeNull();
    expect(button()!.getAttribute("aria-label")).toBe("Unmute");
    expect(button()!.getAttribute("aria-pressed")).toBe("false");
    expect(video()!.muted).toBe(true);
  });

  it("a tap turns the sound on, and another turns it off", async () => {
    await openShot("https://example.invalid/clip.mp4");
    await act(async () => button()!.click());
    expect(video()!.muted).toBe(false);
    expect(button()!.getAttribute("aria-label")).toBe("Mute");
    expect(button()!.getAttribute("aria-pressed")).toBe("true");

    await act(async () => button()!.click());
    expect(video()!.muted).toBe(true);
    expect(button()!.getAttribute("aria-label")).toBe("Unmute");
  });

  it("a held photo has no sound to offer, so no button", async () => {
    await openShot(undefined);
    expect(video()).toBeNull();
    expect(button()).toBeNull();
  });

  it("tapping it does not also hype, the way a double tap on the photo would", async () => {
    const hype = vi.fn();
    const { PostPeek } = await import("@/components/feed/PostPeek");
    await act(async () =>
      root.render(
        createElement(PostPeek, {
          src: "p.jpg", videoSrc: "c.mp4", aspectRatio: 0.5625, postId: "s1", targetType: "shot",
          caption: null, hyped: false, hypeCount: 0, commentCount: 0, saved: false,
          onHype: hype, onComment() {}, onShare() {}, onSave() {}, onClose() {},
        }),
      ),
    );
    await act(async () => button()!.click());
    await act(async () => button()!.click());
    expect(hype).not.toHaveBeenCalled();
  });
});
