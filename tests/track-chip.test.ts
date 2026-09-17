// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * The song under a feed post plays while that post is on screen.
 *
 * The chip used to read `isIntersecting` alone, which stays true for a post
 * that is only slightly in view: scrolling away restarted its song, and it
 * kept playing over the next post.
 */

vi.mock("@/lib/spotify-player", () => ({ spotifyPlay: async () => true, spotifyPause: async () => {} }));

const played: string[] = [];
let paused = 0;
let root: Root;
let host: HTMLDivElement;
/** The chip's observer callback, per observed element. */
const observers: ((entries: { isIntersecting: boolean; intersectionRatio: number }[]) => void)[] = [];

const track = (id: string) => ({
  id,
  title: id,
  artist: "",
  artwork: "",
  preview: `https://example.test/${id}.mp3`,
});

/** Scroll a chip to `ratio` of itself on screen. */
function scrollTo(chip: number, ratio: number) {
  return act(async () => observers[chip]([{ isIntersecting: ratio > 0, intersectionRatio: ratio }]));
}

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  played.length = 0;
  paused = 0;
  observers.length = 0;
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value(this: HTMLMediaElement) {
      played.push(this.src);
      Object.defineProperty(this, "paused", { configurable: true, get: () => false });
      return Promise.resolve();
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", {
    configurable: true,
    value(this: HTMLMediaElement) {
      paused++;
      Object.defineProperty(this, "paused", { configurable: true, get: () => true });
    },
  });
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: (entries: { isIntersecting: boolean; intersectionRatio: number }[]) => void) {
        observers.push(cb);
      }
      observe() {}
      disconnect() {}
    },
  );
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function render(ids: string[]) {
  const { TrackChip } = await import("@/components/music/TrackChip");
  await act(async () =>
    root.render(
      createElement(
        "div",
        null,
        ...ids.map((id) => createElement(TrackChip, { key: id, track: track(id), autoPlayInView: true })),
      ),
    ),
  );
}

describe("a song under a feed post", () => {
  it("plays once the post is properly on screen", async () => {
    await render(["a"]);
    expect(played).toHaveLength(0);
    await scrollTo(0, 0.9);
    expect(played).toEqual(["https://example.test/a.mp3"]);
  });

  it("stops — and does not start again — as the post scrolls away", async () => {
    await render(["a"]);
    await scrollTo(0, 0.9);
    await scrollTo(0, 0.4);
    expect(paused).toBe(1);
    expect(played).toHaveLength(1);
    await scrollTo(0, 0);
    expect(played).toHaveLength(1);
  });

  it("hands over to the next post's song instead of talking over it", async () => {
    await render(["a", "b"]);
    await scrollTo(0, 0.9);
    await scrollTo(1, 0.9);
    // The post you left lets go after the new one has started; its release
    // must not stop the song now playing.
    await scrollTo(0, 0.2);
    expect(played).toEqual(["https://example.test/a.mp3", "https://example.test/b.mp3"]);
    expect(played.at(-1)).toContain("b.mp3");
  });
});
