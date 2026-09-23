import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * The module holds its state in module scope, which is the point of it — every
 * card shares one preference and one audio owner. So each test loads it fresh
 * rather than trying to reset it from outside.
 */
async function load() {
  vi.resetModules();
  return import("../src/lib/shot-audio");
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe("shot audio preference", () => {
  it("defaults to unmuted", async () => {
    // A Shot is made with sound. Whether the browser allows it is a separate
    // question the card answers by trying and falling back.
    const a = await load();
    expect(a.isMuted()).toBe(false);
  });

  it("remembers a mute, and shares it with song previews", async () => {
    // The mute lives in lib/sound now: one switch for the whole feed, so
    // muting a Shot silences the song on the next post too. It persists
    // rather than lasting the sitting — muting is deliberate, and a phone
    // that starts talking again tomorrow is the surprise worth avoiding.
    const a = await load();
    a.setMuted(true);
    expect(localStorage.getItem("hypefy_sound_muted")).toBe("1");

    // A second card mounting later reads the same choice.
    const b = await load();
    expect(b.isMuted()).toBe(true);
  });

  it("takes over a mute made before there was one switch", async () => {
    // Someone who muted music yesterday meant "be quiet", not "be quiet
    // except for videos".
    localStorage.setItem("hypefy_music_muted", "1");
    const a = await load();
    expect(a.isMuted()).toBe(true);
  });

  it("notifies every card when the preference changes", async () => {
    const a = await load();
    let calls = 0;
    const stop = a.subscribe(() => calls++);
    a.setMuted(true);
    expect(calls).toBeGreaterThan(0);
    const after = calls;
    // Setting the same value again is not a change and must not churn.
    a.setMuted(true);
    expect(calls).toBe(after);
    stop();
    a.setMuted(false);
    expect(calls).toBe(after);
  });
});

describe("who is allowed to be audible", () => {
  it("gives sound to one card at a time", async () => {
    const a = await load();
    a.claimAudio("shot-1");
    expect(a.ownsAudio("shot-1")).toBe(true);

    // Two Shots talking over each other is the failure people remember.
    a.claimAudio("shot-2");
    expect(a.ownsAudio("shot-1")).toBe(false);
    expect(a.ownsAudio("shot-2")).toBe(true);
  });

  it("only releases for the card that holds it", async () => {
    const a = await load();
    a.claimAudio("shot-1");
    // A card scrolling out must not silence the card that took over from it.
    a.releaseAudio("shot-2");
    expect(a.ownsAudio("shot-1")).toBe(true);
    a.releaseAudio("shot-1");
    expect(a.ownsAudio("shot-1")).toBe(false);
  });

  it("needs both the preference and the claim to be audible", async () => {
    const a = await load();
    expect(a.shouldBeAudible("shot-1")).toBe(false); // unmuted, but unclaimed

    a.claimAudio("shot-1");
    expect(a.shouldBeAudible("shot-1")).toBe(true);

    a.setMuted(true);
    expect(a.shouldBeAudible("shot-1")).toBe(false); // claimed, but muted
  });
});
