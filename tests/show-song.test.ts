import { describe, expect, it } from "vitest";
import { readLayers, showSong } from "@/lib/show-layers";
import { readFileSync } from "node:fs";

const song = (extra: Record<string, unknown> = {}) => ({
  id: "m1",
  type: "music",
  x: 0.5,
  y: 0.5,
  scale: 1,
  rotation: 0,
  payload: { id: "t1", title: "Be My Baby", artist: "The Ronettes", artwork: null, preview: null, ...extra },
});

describe("the song a Show plays", () => {
  it("keeps a Spotify song's uri on the sticker, which is all it has to play", () => {
    const [layer] = readLayers([song({ uri: "spotify:track:2G0Krwp2BDcE8cAXALDkCl" })]);
    expect((layer.payload as { uri?: string }).uri).toBe("spotify:track:2G0Krwp2BDcE8cAXALDkCl");
  });

  it("drops a uri that is not a Spotify track", () => {
    const [layer] = readLayers([song({ uri: "javascript:alert(1)" })]);
    expect((layer.payload as { uri?: string }).uri).toBeUndefined();
  });

  it("plays the music sticker when nothing was picked on the camera", () => {
    const layers = readLayers([song({ uri: "spotify:track:2G0Krwp2BDcE8cAXALDkCl", start: 32 })]);
    expect(showSong(null, layers)).toMatchObject({ id: "t1", uri: "spotify:track:2G0Krwp2BDcE8cAXALDkCl", start: 32 });
  });

  it("prefers the song picked on the camera", () => {
    const layers = readLayers([song({ preview: "https://x/a.mp3" })]);
    const picked = { id: "t9", title: "Other", artist: "Someone", artwork: "", preview: "https://x/b.mp3" };
    expect(showSong(picked, layers)?.id).toBe("t9");
  });

  it("has nothing to play for a sticker with neither preview nor uri", () => {
    expect(showSong(null, readLayers([song()]))).toBeNull();
  });

  it("and the viewer asks for it, rather than only the camera's song", () => {
    const viewer = readFileSync("src/components/shows/ShowViewer.tsx", "utf8");
    expect(viewer).toContain("showSong(show.track, readLayers(show.layers))");
  });

  it("and the preview draws the stickers instead of the bare photo", () => {
    const preview = readFileSync("src/components/create/ShotPreview.tsx", "utf8");
    expect(preview).toContain("<LayerStack layers={layers} frame={frame} editing />");
  });
});

describe("the song's name at the foot of a Show", () => {
  it("is only for a song added with Add sound, not one already on a sticker", () => {
    const viewer = readFileSync("src/components/shows/ShowViewer.tsx", "utf8");
    expect(viewer).toContain("const songLabel = useMemo(() => parseTrack(show.track), [show.track]);");
    expect(viewer).toContain("{songLabel && !menuOpen && (");
    expect(viewer).not.toContain("{showTrack && !menuOpen && (");
  });
});

describe("stickers can be pressed on a Show", () => {
  const viewer = readFileSync("src/components/shows/ShowViewer.tsx", "utf8");
  const view = readFileSync("src/components/shows/LayerView.tsx", "utf8");
  it("the stickers sit above the surface that moves between Shows", () => {
    // They were below it, so every press on a poll or a link went to the
    // surface and skipped to the next Show.
    expect(viewer).toContain('className="pointer-events-none absolute inset-0 z-[11]"');
    expect(viewer).toContain('className="absolute inset-x-0 z-10"');
  });
  it("and only the ones that do something take the press", () => {
    // The expression, not the one-line form it used to be written on: the
    // wrapper now also carries the author's "show me the results" tap, so it
    // spans several lines. What is being tested is unchanged.
    expect(view).toContain(
      'className={!editing && PRESSABLE.has(layer.type) ? "pointer-events-auto" : "pointer-events-none"}',
    );
    expect(view).not.toMatch(/PRESSABLE[^;]*"text"/);
  });
  it("using one holds the Show", () => {
    expect(viewer).toContain("onPointerDown={() => setPaused(true)}");
    expect(viewer).toContain("onFocus={() => setPaused(true)}");
  });
});
