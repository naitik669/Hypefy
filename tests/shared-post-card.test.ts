// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SharedPostCard, postCardRatio, type SharedPost } from "@/components/messages/SharedPostCard";

/**
 * A post shared into a chat, framed: the author on top, the photo inset at
 * its own shape, the caption under it, a stack mark only when there is more
 * than one photo, and the words set large when there is no photo.
 */

describe("the photo's shape", () => {
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

  it("shows the photo inset at the post's own shape, and opens the post", async () => {
    const card = await render({ image_url: "https://x.test/a.jpg", aspect_ratio: 1.5 });
    expect(card.getAttribute("href")).toBe("/p/p1");
    const img = card.querySelector("img[src='https://x.test/a.jpg']")!;
    expect((img.parentElement as HTMLElement).style.aspectRatio).toBe("1.5");
    expect(img.parentElement!.className).toContain("rounded-[11px]");
  });

  it("puts the author on top and the caption under the photo", async () => {
    const card = await render({ image_url: "https://x.test/a.jpg", caption: "golden hour" });
    const order = [...card.querySelectorAll("span, img, p")].map((el) =>
      el.tagName === "IMG" ? "photo" : el.textContent === "maya" ? "name" : el.textContent === "golden hour" ? "caption" : null,
    ).filter(Boolean);
    expect(order).toEqual(["name", "photo", "caption"]);
  });

  it("leaves out the caption line when there is no caption", async () => {
    const card = await render({ image_url: "https://x.test/a.jpg", caption: null });
    expect(card.querySelector("p")).toBeFalsy();
  });

  it("marks a post with several photos, and only that", async () => {
    let card = await render({ image_urls: ["a", "b", "c"] });
    expect(card.querySelector('[aria-label="3 photos"]')).toBeTruthy();
    await act(async () => root.unmount());
    host.remove();
    card = await render({ image_urls: ["a"] });
    expect(card.querySelector("svg[aria-label]")).toBeFalsy();
  });

  it("sets the words large when there is no photo, once, with the author above", async () => {
    const card = await render({ image_url: null, caption: "the roof is the only quiet place" });
    expect(card.querySelector("img:not([alt=''])")).toBeFalsy();
    expect(card.textContent!.match(/the roof is the only quiet place/g)).toHaveLength(1);
    expect(card.textContent).toContain("maya");
  });
});
