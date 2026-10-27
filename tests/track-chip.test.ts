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

// The song's name is a link to its page now. The real Link watches itself
// with an observer of its own (for prefetching), which is not what is under
// test here and would be counted among the chip's.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));
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

/**
 * The overlay variant: the disc in its case, inside the top-left of a post.
 *
 * The case used to be the play/pause button. It is not any more — muting is
 * the only way to stop a song now, and tapping the case is how you find out
 * what is playing. Getting that wrong means a tap meant to read the title
 * silences the post instead, which is the thing this change exists to fix.
 */
async function renderOverlay() {
  const { TrackChip } = await import("@/components/music/TrackChip");
  await act(async () =>
    root.render(createElement(TrackChip, { track: track("a"), autoPlayInView: true, overlay: true })),
  );
}

const caseButton = () => host.querySelector("button") as HTMLButtonElement;
const titleLink = () => host.querySelector("a") as HTMLAnchorElement;
const stage = () => host.querySelector("[data-sound-stage]") as HTMLElement;
const isOpen = () => stage().getAttribute("data-open") === "true";

describe("the disc in its case", () => {
  it("does not stop the music when it is tapped", async () => {
    // The whole point of the change. A tap used to pause; now the mute
    // button is the only off switch and this one only shows the title.
    await renderOverlay();
    await scrollTo(0, 0.9);
    expect(played).toHaveLength(1);
    await act(async () => caseButton().click());
    expect(paused).toBe(0);
    expect(played).toHaveLength(1);
  });

  it("shows the title instead", async () => {
    await renderOverlay();
    expect(isOpen()).toBe(false);
    await act(async () => caseButton().click());
    expect(isOpen()).toBe(true);
  });

  it("and tapping it again goes to the song's page rather than doing nothing", async () => {
    // Otherwise the second tap is a dead control sitting on top of a photo.
    await renderOverlay();
    let went = 0;
    await act(async () => caseButton().click());
    titleLink().addEventListener("click", (e) => {
      e.preventDefault();
      went++;
    });
    await act(async () => caseButton().click());
    expect(went).toBe(1);
  });

  it("the song's page is reachable without seeing the title at all", async () => {
    // The reveal is a hover-and-tap affordance. A keyboard or screen reader
    // user never triggers it, so the link has to be in the page regardless.
    await renderOverlay();
    expect(isOpen()).toBe(false);
    expect(titleLink().getAttribute("href")).toContain("/sound/");
    expect(titleLink().textContent).toContain("a");
  });

  it("focus holds the title out, rather than snatching it back on a timer", async () => {
    // Someone reading it with the keyboard cannot hover and read quickly.
    vi.useFakeTimers();
    try {
      await renderOverlay();
      await act(async () => caseButton().focus());
      expect(isOpen()).toBe(true);
      await act(async () => {
        vi.advanceTimersByTime(10_000);
      });
      expect(isOpen()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("but a tap lets it tuck back on its own", async () => {
    vi.useFakeTimers();
    try {
      await renderOverlay();
      await act(async () => caseButton().click());
      expect(isOpen()).toBe(true);
      await act(async () => {
        vi.advanceTimersByTime(3_000);
      });
      expect(isOpen()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
