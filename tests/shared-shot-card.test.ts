// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SharedShotCard, shotCardRatio } from "@/components/messages/SharedShotCard";

/**
 * A Shot shared into a chat: its own shape, the author along the bottom, the
 * Shots bolt top-right, and its poster rather than a blank video.
 */

describe("the card's shape", () => {
  it("is the clip's own shape", () => {
    expect(shotCardRatio(1080, 1350)).toBeCloseTo(0.8);
    expect(shotCardRatio(1000, 1000)).toBe(1);
  });

  it("is never taller than a phone Shot", () => {
    expect(shotCardRatio(500, 2000)).toBeCloseTo(9 / 16);
  });

  it("crops wide clips to 4:3 rather than shrinking them to a sliver", () => {
    expect(shotCardRatio(1920, 1080)).toBeCloseTo(4 / 3);
  });

  it("is a phone Shot when the size is unknown", () => {
    for (const [w, h] of [[0, 0], [NaN, 100], [100, 0]]) {
      expect(shotCardRatio(w, h)).toBeCloseTo(9 / 16);
    }
  });
});

describe("the card", () => {
  let root: Root;
  let host: HTMLDivElement;
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  async function render(poster: string | null) {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () =>
      root.render(
        createElement(SharedShotCard, {
          shot: { id: "s1", media_url: "https://x.test/s1.mp4", poster_url: poster, caption: "roof" },
          author: { username: "maya", display_name: "Maya", avatar_hue: 30, avatar_url: null },
        }),
      ),
    );
    return host.querySelector("a") as HTMLAnchorElement;
  }

  it("draws the poster, not a video that shows nothing until it plays", async () => {
    const card = await render("https://x.test/s1-poster.jpg");
    expect(card.querySelector("img[src='https://x.test/s1-poster.jpg']")).toBeTruthy();
    expect(card.querySelector("video")).toBeFalsy();
  });

  it("falls back to the video when the Shot has no poster", async () => {
    const card = await render(null);
    expect(card.querySelector("video")).toBeTruthy();
  });

  it("opens the Shot, and says whose it is", async () => {
    const card = await render("https://x.test/p.jpg");
    expect(card.getAttribute("href")).toBe("/shots/s1");
    expect(card.textContent).toContain("maya");
  });

  it("puts the bolt top-right and the name at the bottom, with no play button", async () => {
    const card = await render("https://x.test/p.jpg");
    const bolt = card.querySelector("svg") as SVGElement;
    expect(bolt.getAttribute("class")).toContain("right-2.5");
    expect(bolt.getAttribute("class")).toContain("top-2.5");
    const name = [...card.querySelectorAll("span")].find((s) => s.textContent === "maya")!;
    expect(name.parentElement!.className).toContain("bottom-2");
    expect(card.textContent).not.toMatch(/shot|play/i);
  });
});
