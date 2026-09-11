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
});
