// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SharedPostCard, postCardRatio, type SharedPost } from "@/components/messages/SharedPostCard";

/**
 * A post shared into a chat, in the shared Shot's style: the picture at its
 * own shape, the author along the bottom, a stack mark only when there is
 * more than one picture, and words set large when there is no picture.
 */

describe("the card's shape", () => {
  it("is the post's own shape", () => {
    expect(postCardRatio(1)).toBe(1);
    expect(postCardRatio(1.5)).toBe(1.5);
  });
  it("is never taller than 4:5, the feed's own tallest", () => {
    expect(postCardRatio(9 / 16)).toBeCloseTo(4 / 5);
  });
  it("is never wider than 16:9", () => {
    expect(postCardRatio(3)).toBeCloseTo(16 / 9);
  });
  it("is square when the shape is unknown", () => {
    for (const r of [null, undefined, 0, -1, NaN]) expect(postCardRatio(r as number)).toBe(1);
  });
});

describe("the card", () => {
  let root: Root;
  let host: HTMLDivElement;
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  async function render(post: Partial<SharedPost>) {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () =>
      root.render(
        createElement(SharedPostCard, {
          post: { id: "p1", caption: "roof again", image_url: null, ...post },
          author: { username: "maya", display_name: "Maya", avatar_hue: 30, avatar_url: null },
        }),
      ),
    );
    return host.querySelector("a") as HTMLAnchorElement;
  }

  it("shows the picture at the post's own shape, and opens the post", async () => {
    const card = await render({ image_url: "https://x.test/a.jpg", aspect_ratio: 1.5 });
    expect(card.getAttribute("href")).toBe("/p/p1");
    expect(card.querySelector("img[src='https://x.test/a.jpg']")).toBeTruthy();
    expect(card.style.aspectRatio).toBe("1.5");
  });

  it("puts the author at the bottom", async () => {
    const card = await render({ image_url: "https://x.test/a.jpg" });
    const name = [...card.querySelectorAll("span")].find((s) => s.textContent === "maya")!;
    expect(name.parentElement!.className).toContain("bottom-2");
  });

  it("marks a post with several pictures, and only that", async () => {
    let card = await render({ image_urls: ["a", "b", "c"] });
    expect(card.querySelector('[aria-label="3 photos"]')).toBeTruthy();
    await act(async () => root.unmount());
    host.remove();
    card = await render({ image_urls: ["a"] });
    expect(card.querySelector("svg[aria-label]")).toBeFalsy();
  });

  it("sets the words large when there is no picture, rather than two grey lines", async () => {
    const card = await render({ image_url: null, caption: "the roof is the only quiet place" });
    expect(card.querySelector("img")).toBeFalsy();
    expect(card.textContent).toContain("the roof is the only quiet place");
    expect(card.textContent).toContain("maya");
  });
});
