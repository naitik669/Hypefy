// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * A Diary's song goes round again when it ends — from the part its writer
 * picked, not from 0:00 — and every other song still stops at its end.
 */

const played: { src: string; at: number }[] = [];
let el: HTMLAudioElement | null = null;
/** Whether the element is stopped, as a real one reports it: play() starts it. */
let stopped = true;

vi.mock("@/lib/spotify-player", () => ({ spotifyPlay: async () => true, spotifyPause: async () => {} }));

beforeEach(() => {
  played.length = 0;
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value(this: HTMLMediaElement) {
      el = this as HTMLAudioElement;
      stopped = false;
      played.push({ src: this.src, at: this.currentTime });
      return Promise.resolve();
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value() {} });
});

/**
 * Make the shared element reach the end: stopped, and "ended" until it is
 * played again. Both events fire, as they do in a browser.
 */
function finish() {
  stopped = true;
  Object.defineProperty(el!, "ended", { configurable: true, get: () => stopped });
  Object.defineProperty(el!, "paused", { configurable: true, get: () => stopped });
  el!.dispatchEvent(new Event("pause"));
  el!.dispatchEvent(new Event("ended"));
}

const track = (id: string, start?: number) => ({
  id,
  title: id,
  artist: "",
  artwork: "",
  preview: `https://example.test/${id}.mp3`,
  ...(start ? { start } : {}),
});

describe("looping", () => {
  it("starts a looping song again from its snippet when it ends", async () => {
    const { playPreview, stopPreview } = await import("@/lib/music");
    playPreview(track("a", 12), { loop: true });
    expect(played).toHaveLength(1);
    finish();
    expect(played).toHaveLength(2);
    expect(el!.currentTime).toBe(12);
    stopPreview();
  });

  it("lets any other song end", async () => {
    const { playPreview, stopPreview } = await import("@/lib/music");
    playPreview(track("b"));
    expect(played).toHaveLength(1);
    finish();
    expect(played).toHaveLength(1);
    stopPreview();
  });

  it("stops looping once a song that does not loop takes over", async () => {
    const { playPreview, stopPreview } = await import("@/lib/music");
    playPreview(track("c"), { loop: true });
    playPreview(track("d"));
    finish();
    expect(played.map((p) => p.src.split("/").pop())).toEqual(["c.mp3", "d.mp3"]);
    stopPreview();
  });

  it("starts a returning song from its snippet, not where it was cut off", async () => {
    const { ensurePreviewPlaying, pausePreview, stopPreview } = await import("@/lib/music");
    const t = track("e", 9);
    ensurePreviewPlaying(t, { loop: true, restart: true });
    el!.currentTime = 20; // it had played on a while
    pausePreview();
    ensurePreviewPlaying(t, { loop: true, restart: true });
    expect(el!.currentTime).toBe(9);
    stopPreview();
  });
});

describe("pages that play while on screen", () => {
  it("hands the song back to the page underneath when one closes", async () => {
    const { claimPreview } = await import("@/lib/music");
    const releaseDeck = claimPreview(track("deck"), { loop: true });
    const releaseFull = claimPreview(track("full"), { loop: true });
    expect(played.at(-1)!.src).toContain("full.mp3");
    releaseFull();
    expect(played.at(-1)!.src).toContain("deck.mp3");
    releaseDeck();
  });

  it("a page letting go late does not stop the one that replaced it", async () => {
    const { claimPreview } = await import("@/lib/music");
    const releaseOld = claimPreview(track("old"), { loop: true });
    const releaseNew = claimPreview(track("new"), { loop: true });
    const count = played.length;
    releaseOld();
    expect(played.length).toBe(count);
    expect(played.at(-1)!.src).toContain("new.mp3");
    releaseNew();
  });
});

describe("a song the browser will not start yet", () => {
  it("starts on the next touch instead of never", async () => {
    const { claimPreview } = await import("@/lib/music");
    let refuse = true;
    const attempts: string[] = [];
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value(this: HTMLMediaElement) {
        attempts.push(this.src);
        if (refuse) return Promise.reject(Object.assign(new Error("no"), { name: "NotAllowedError" }));
        return Promise.resolve();
      },
    });
    const release = claimPreview(track("opened-cold"), { loop: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(attempts).toHaveLength(1);
    refuse = false;
    document.dispatchEvent(new Event("pointerdown"));
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toContain("opened-cold.mp3");
    release();
  });
});
