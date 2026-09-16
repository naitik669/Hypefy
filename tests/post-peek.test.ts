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
