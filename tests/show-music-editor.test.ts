import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { clampStart, soundGraph } from "@/components/shows/MusicEditor";
import { readLayers, showSong } from "@/lib/show-layers";
import { parseTrack } from "@/lib/track";

const song = (extra: Record<string, unknown>) => ({
  id: "m",
  type: "music",
  x: 0.5,
  y: 0.5,
  scale: 1,
  rotation: 0,
  payload: { id: "t1", title: "Be My Baby", artist: "The Ronettes", artwork: null, preview: "https://x/a.mp3", ...extra },
});

describe("the part of the song that plays", () => {
  it("keeps a style and a length the editor offers, and refuses others", () => {
    const [ok] = readLayers([song({ style: "cd", length: 10, start: 12 })]);
    expect(ok.payload).toMatchObject({ style: "cd", length: 10, start: 12 });
    const [bad] = readLayers([song({ style: "disco", length: 7 })]);
    expect(bad.payload).not.toHaveProperty("style");
    expect(bad.payload).not.toHaveProperty("length");
  });

  it("is what the viewer plays: from start, for length", () => {
    expect(showSong(null, readLayers([song({ start: 12, length: 10 })]))).toMatchObject({ start: 12, length: 10 });
    expect(parseTrack({ id: "a", title: "b", preview: "c", length: 3 })).not.toHaveProperty("length");
  });

  it("and the player goes round at the end of the part, not the end of the file", () => {
    const music = readFileSync("src/lib/music.ts", "utf8");
    expect(music).toContain("end: track.length ? start + track.length : null");
    expect(music).toContain("audio.currentTime >= loopFrom.end");
    expect(readFileSync("src/components/shows/ShowViewer.tsx", "utf8")).toContain(
      "ensurePreviewPlaying(showTrack, showTrack.length ? { loop: true } : undefined);",
    );
  });

  it("the window stays inside the 30 seconds, on half seconds", () => {
    expect(clampStart(-4, 10)).toBe(0);
    expect(clampStart(27, 10)).toBe(20);
    expect(clampStart(12.3, 15)).toBe(12.5);
  });

  it("the sound graph is the same every time for one song", () => {
    expect(soundGraph("t1", 52)).toEqual(soundGraph("t1", 52));
    expect(soundGraph("t1", 52)).not.toEqual(soundGraph("t2", 52));
    expect(soundGraph("t1", 52).every((h) => h > 0 && h <= 1)).toBe(true);
  });
});

describe("Music only", () => {
  it("is drawn for nobody but the person arranging it", () => {
    const view = readFileSync("src/components/shows/LayerView.tsx", "utf8");
    expect(view).toContain('if (style === "only") {\n    if (!editing) return null;');
  });

  it("and a Show picks its part on the sticker, so the song search skips its own step", () => {
    expect(readFileSync("src/components/shows/ShowEditor.tsx", "utf8")).toContain("pickPart={false}");
  });
});
