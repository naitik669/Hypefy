// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { ChatVideo } from "@/components/messages/ChatMedia";

/**
 * What the server sends for a video message.
 *
 * ChatVideo decides whether to arm immediately from whether the browser has
 * an IntersectionObserver — and the server has none either, so the check has
 * to ask about `window` as well or every server-rendered thread would ship
 * with every video's `src` already committed: the exact thing the gating
 * exists to prevent, reintroduced on first paint.
 *
 * This file runs in node, with no window and no observer, which is the only
 * place that distinction is visible. The jsdom tests cannot see it.
 */

describe("server-rendered", () => {
  const html = () =>
    renderToString(
      createElement(ChatVideo, {
        url: "https://x.test/clip.mp4",
        className: "w-full",
        controls: true,
        preload: "metadata",
      } as never),
    );

  it("carries no source", () => {
    expect(html()).not.toContain("https://x.test/clip.mp4");
  });

  it("and asks for nothing to be preloaded", () => {
    expect(html()).toContain('preload="none"');
  });

  it("but still has its poster, so the bubble has a shape before hydration", () => {
    expect(html()).toContain("poster=");
  });
});
