import { describe, expect, it } from "vitest";
import { musicSnippet, packTrack, unpackTrack } from "@/lib/music-message";
import type { Track } from "@/lib/music";

const track: Track = {
  id: "t1",
  title: "Agora Hills",
  artist: "Doja Cat",
  artwork: "https://cdn.example/art.jpg",
  preview: "https://cdn.example/p.mp3",
  uri: "spotify:track:abc",
  durationMs: 253000,
};

describe("a song in a message", () => {
  it("survives the round trip through a message body", () => {
    const back = unpackTrack(packTrack(track));
    expect(back).toEqual(track);
  });

  it("keeps only what a bubble plays and draws", () => {
    const fat = { ...track, album: "Scarlet", explicit: true } as unknown as Track;
    expect(Object.keys(JSON.parse(packTrack(fat))).sort()).toEqual(
      ["artist", "artwork", "durationMs", "id", "preview", "title", "uri"],
    );
  });

  it("carries a chosen snippet start, and leaves it out when there is none", () => {
    expect(unpackTrack(packTrack({ ...track, start: 42 }))?.start).toBe(42);
    expect(JSON.parse(packTrack(track))).not.toHaveProperty("start");
  });

  it("gives nothing for a body that is not a song", () => {
    expect(unpackTrack(null)).toBeNull();
    expect(unpackTrack("")).toBeNull();
    expect(unpackTrack("just words")).toBeNull();
    expect(unpackTrack("[1,2]")).toBeNull();
    expect(unpackTrack(JSON.stringify({ title: "no id" }))).toBeNull();
    expect(unpackTrack(JSON.stringify({ id: "x" }))).toBeNull();
  });

  it("fills in what a half-written song leaves out", () => {
    const thin = unpackTrack(JSON.stringify({ id: "t2", title: "Untitled" }));
    expect(thin).toEqual({ id: "t2", title: "Untitled", artist: "", artwork: "", preview: "" });
  });

  it("says what it is in a chat list", () => {
    expect(musicSnippet(packTrack(track))).toBe("Agora Hills · Doja Cat");
    expect(musicSnippet(packTrack({ ...track, artist: "" }))).toBe("Agora Hills");
    expect(musicSnippet("not a song")).toBe("Song");
  });
});
