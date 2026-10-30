import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ALL_TILES, ASK_AND_PLAY, BOARD, HYPE_AND_PLAN, TAGS, YOURS, nextRecent } from "@/components/shows/StickerTray";
import { readLayers } from "@/lib/show-layers";

describe("the sticker tray", () => {
  it("is arranged as approved: the tags, then every big sticker on one board", () => {
    expect(ASK_AND_PLAY.map((t) => t.label)).toEqual(["Poll", "Quiz", "Question"]);
    expect(HYPE_AND_PLAN.map((t) => t.label)).toEqual(["Hype slider", "Countdown", "Add yours"]);
    expect(YOURS.map((t) => t.label)).toEqual(["Post or Shot"]);
    expect(TAGS.map((t) => t.label)).toEqual(["Time", "Music", "Mention", "Link", "Location", "Hashtag"]);
    expect(BOARD.map((t) => t.label)).toEqual(["Quiz", "Poll", "Countdown", "Question", "Add yours", "Hype slider", "Post or Shot"]);
    expect(new Set(ALL_TILES.map((t) => t.key)).size).toBe(13);
  });

  it("every tile is the real sticker, one the Show would keep", () => {
    // Drawn by LayerBody from a sample layer; a sample the parser refused
    // would be a tile for something that cannot exist.
    for (const t of ALL_TILES) expect(readLayers([t.layer]), t.label).toHaveLength(1);
  });

  it("each hangs at an angle, a little different from its neighbour", () => {
    for (const shelf of [ASK_AND_PLAY, HYPE_AND_PLAN, TAGS]) {
      for (let i = 1; i < shelf.length; i++) expect(Math.sign(shelf[i].tilt)).not.toBe(Math.sign(shelf[i - 1].tilt));
    }
  });

  it("no emoji in it any more", () => {
    const src = readFileSync("src/components/shows/StickerTray.tsx", "utf8");
    expect(src).not.toContain("EMOJI");
    expect(src).not.toContain("onSticker");
  });

  it("remembers the last few used, newest first, each once", () => {
    expect(nextRecent([], "poll")).toEqual(["poll"]);
    expect(nextRecent(["poll", "quiz", "time", "link"], "time")).toEqual(["time", "poll", "quiz", "link"]);
    expect(nextRecent(["poll", "quiz", "time", "link"], "music")).toEqual(["music", "poll", "quiz", "time"]);
  });
});

describe("the tray's order", () => {
  it("puts the tags first, above the pinned shelves", () => {
    const tray = readFileSync("src/components/shows/StickerTray.tsx", "utf8");
    const tags = tray.indexOf(">Tags</h2>");
    expect(tags).toBeGreaterThan(0);
    expect(tags).toBeLessThan(tray.indexOf("data-board"));
    // Every big sticker at once, two to a row: no shelves to swipe.
    expect(tray).not.toContain("<Shelf");
    expect(tray).toContain('const BOARD_ORDER: WidgetKey[] = ["quiz", "poll", "countdown", "question", "addyours", "slider", "embed"];');
  });

  it("and the editor's way on is one small Next, not a bar under the picture", () => {
    const editor = readFileSync("src/components/shows/ShowEditor.tsx", "utf8");
    expect(editor).toContain('{busy ? "Posting…" : "Next"}');
    expect(editor).not.toContain('"Add to your Show"');
  });
});
