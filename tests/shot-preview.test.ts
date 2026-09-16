// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * A Shot in a grid plays where it sits. Discover is a wall of stills, and a
 * still of a video is the one thing on that wall lying about what it is —
 * but a grid can hold nine of them, so what plays is bounded on every side.
 */

type Cb = (entries: { isIntersecting: boolean; intersectionRatio: number }[]) => void;
const observers: { cb: Cb; rootMargin: string; targets: Element[] }[] = [];

class FakeIO {
  cb: Cb;
  rootMargin: string;
  targets: Element[] = [];
  constructor(cb: Cb, opts?: { rootMargin?: string }) {
    this.cb = cb;
    this.rootMargin = opts?.rootMargin ?? "";
    observers.push(this);
  }
  observe(el: Element) {
    this.targets.push(el);
  }
  disconnect() {
    const i = observers.indexOf(this);
    if (i >= 0) observers.splice(i, 1);
  }
  unobserve() {}
}

/** The one watching for "near the viewport", vs the one watching visibility. */
const nearOnes = () => observers.filter((o) => o.rootMargin.includes("400"));
const watchOnes = () => observers.filter((o) => !o.rootMargin.includes("400"));

const play = vi.fn(() => Promise.resolve());
const pause = vi.fn();

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  observers.length = 0;
  play.mockClear();
  pause.mockClear();
  vi.stubGlobal("IntersectionObserver", FakeIO);
  HTMLMediaElement.prototype.play = play as unknown as HTMLMediaElement["play"];
  HTMLMediaElement.prototype.pause = pause as unknown as HTMLMediaElement["pause"];
  // jsdom never actually plays anything, so its `paused` is always true and
  // the component's "pause it if it is running" would never fire.
  Object.defineProperty(HTMLMediaElement.prototype, "paused", {
    value: false,
    configurable: true,
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function render(count = 1) {
  const { ShotPreview } = await import("@/components/shots/ShotPreview");
  await act(async () =>
    root.render(
      Array.from({ length: count }, (_, i) =>
        createElement(ShotPreview, {
          key: `s${i}`,
          id: `s${i}`,
          src: `https://example.test/s${i}.mp4`,
          poster: `https://example.test/s${i}.jpg`,
        }),
      ),
    ),
  );
  return [...host.querySelectorAll("video")] as HTMLVideoElement[];
}

const fire = (o: { cb: Cb }, ratio: number) =>
  act(async () => o.cb([{ isIntersecting: ratio > 0, intersectionRatio: ratio }]));

describe("a Shot in a grid", () => {
  it("fetches nothing until it is near the viewport", async () => {
    const [v] = await render();
    expect(v.getAttribute("preload")).toBe("none");
    await fire(nearOnes()[0], 0.01);
    expect(v.getAttribute("preload")).toBe("metadata");
  });

  it("plays while it is on screen and stops when it is not", async () => {
    await render();
    // Held, not looked up again: firing one changes what is registered.
    const watch = watchOnes()[0];
    await fire(watch, 0.9);
    expect(play).toHaveBeenCalledTimes(1);
    await fire(watch, 0);
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it("stays silent, and keeps looping", async () => {
    const [v] = await render();
    expect(v.muted).toBe(true);
    expect(v.loop).toBe(true);
    expect(v.playsInline).toBe(true);
    // The poster is the video's own, so one that never starts looks like what
    // it is rather than like a working feature.
    expect(v.getAttribute("poster")).toBe("https://example.test/s0.jpg");
  });

  it("never plays more than a handful at once", async () => {
    await render(9);
    for (const o of watchOnes()) await fire(o, 0.9);
    // Four, however many are on screen: nine decoding videos is a hot phone.
    expect(play).toHaveBeenCalledTimes(4);
  });

  it("gives its turn back when it leaves, so the next one can play", async () => {
    await render(9);
    const watchers = watchOnes();
    for (const o of watchers) await fire(o, 0.9);
    expect(play).toHaveBeenCalledTimes(4);

    await fire(watchers[0], 0);
    await fire(watchers[8], 0.9);
    expect(play).toHaveBeenCalledTimes(5);
  });
});
