import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { boardLayers, readLayers, LAYER_PLACE_MAX_Y, LAYER_POS_MAX } from "@/lib/show-layers";
import { dragged } from "@/lib/transform-gesture";
import { revealed, seeded, stickerError } from "@/lib/show-stickers";

/**
 * The four decisions behind making every sticker work, kept pure so they can
 * be tested without a browser — the suite has no component tests.
 */

const layer = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  type: "poll",
  x: 0.5,
  y: 0.5,
  scale: 1,
  rotation: 0,
  look: 0,
  payload: { question: "Where?", options: ["Here", "There"] },
  ...over,
});

describe("a Show kept on a board keeps its stickers", () => {
  it("the board draws the Show's layers", () => {
    const got = boardLayers(null, { layers: [layer("a")] });
    expect(got.map((l) => l.id)).toEqual(["a"]);
  });

  it("but not over a picture that is not the Show's", () => {
    // A board item can carry its own upload. The layers were arranged as
    // fractions of a different frame, so over this one they land nowhere
    // anybody placed them.
    expect(boardLayers("https://x.test/own.jpg", { layers: [layer("a")] })).toEqual([]);
  });

  it("an item whose Show has gone draws nothing", () => {
    // A referenced Show that was deleted or moderated comes back null.
    expect(boardLayers(null, null)).toEqual([]);
    expect(boardLayers(null, undefined)).toEqual([]);
  });

  it("and whatever comes back is validated, not trusted", () => {
    // The column has no server-side shape check by design (migration 0182),
    // so this is the boundary where a bad layer is dropped.
    const got = boardLayers(null, {
      layers: [layer("good"), { id: "", type: "poll" }, "nonsense", layer("alsogood")],
    });
    expect(got.map((l) => l.id)).toEqual(["good", "alsogood"]);
  });

  it("a Shot on a board has no layers to draw", () => {
    expect(boardLayers(null, { media_url: "https://x.test/s.mp4" })).toEqual([]);
  });
});

describe("whose eyes see the counts", () => {
  it("a viewer earns them by answering", () => {
    expect(revealed(false, null)).toBe(false);
    expect(revealed(false, 0)).toBe(true);
    expect(revealed(false, 2)).toBe(true);
  });

  it("the author has them from the start, without voting", () => {
    // The bug: `mine !== null` alone hid the author's own results until they
    // voted in their own poll.
    expect(revealed(true, null)).toBe(true);
  });

  it("and option zero counts as an answer", () => {
    // A falsy index is a real choice; `mine ? …` would have lost it.
    expect(revealed(false, 0)).toBe(true);
  });
});

describe("state that arrives after the sticker is already on screen", () => {
  it("is adopted while nobody has touched the control", () => {
    const next = seeded({ value: null, seed: null }, 3, false);
    expect(next).toEqual({ value: 3, seed: 3 });
  });

  it("but never overwrites what the person just did", () => {
    // Their vote is newer than the server's idea of it.
    const next = seeded({ value: 1, seed: null }, 3, true);
    expect(next).toEqual({ value: 1, seed: 3 });
  });

  it("and the seed is remembered either way, so it lands only once", () => {
    const held = seeded({ value: 1, seed: null }, 3, true);
    expect(seeded(held, 3, false)).toBe(held);
  });

  it("returns the very same object when nothing changed", () => {
    // The caller adjusts state with this during render; a fresh object every
    // time is a render loop. Same lesson as lib/chat-activity.
    const held = { value: 7, seed: 7 };
    expect(seeded(held, 7, false)).toBe(held);
    expect(seeded(held, 7, true)).toBe(held);
  });

  it("a later seed is adopted again once untouched", () => {
    const first = seeded({ value: null, seed: null }, 2, false);
    const second = seeded(first, 5, false);
    expect(second).toEqual({ value: 5, seed: 5 });
  });

  it("works for a slider's number as well as a poll's index", () => {
    expect(seeded({ value: 50, seed: null as number | null }, 78, false)).toEqual({ value: 78, seed: 78 });
    expect(seeded({ value: "", seed: "" }, "running late", false)).toEqual({
      value: "running late",
      seed: "running late",
    });
  });
});

describe("a sticker cannot be dragged under the chrome", () => {
  const frame = { width: 390, height: 844 };
  const place = { x: 0.5, y: 0.5, scale: 1, rotation: 0 };

  it("a drag to the very bottom stops above the reply row", () => {
    const low = dragged(place, { x: 0, y: 0 }, { x: 0, y: 4000 }, frame);
    expect(low.y).toBe(LAYER_PLACE_MAX_Y);
    expect(low.y).toBeLessThan(LAYER_POS_MAX);
  });

  it("the top is untouched — only the foot is anybody else's", () => {
    const high = dragged(place, { x: 0, y: 0 }, { x: 0, y: -4000 }, frame);
    expect(high.y).toBeLessThan(0);
  });

  it("and sideways still runs past the edge, so a sticker can bleed off", () => {
    const off = dragged(place, { x: 0, y: 0 }, { x: 4000, y: 0 }, frame);
    expect(off.x).toBe(LAYER_POS_MAX);
  });

  it("but a Show already posted keeps the placement it was given", () => {
    // Clamping on read would silently move somebody's arrangement. This is
    // why the limit lives in the drag and not in readLayers.
    const [kept] = readLayers([
      { id: "a", type: "text", x: 0.5, y: 1.05, scale: 1, rotation: 0, look: 0, payload: { text: "down here" } },
    ]);
    expect(kept.y).toBeCloseTo(1.05);
    expect(kept.y).toBeGreaterThan(LAYER_PLACE_MAX_Y);
  });
});

describe("wired into the thread", () => {
  const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
  const stack = read("src/components/shows/LayerView.tsx");
  const viewer = read("src/components/shows/ShowViewer.tsx");
  const stickers = read("src/components/shows/ShowStickers.tsx");
  const poll = read("src/components/shows/ShowPoll.tsx");
  const tray = read("src/components/shows/StickerTray.tsx");
  const editor = read("src/components/shows/ShowEditor.tsx");
  const board = read("src/app/(app)/showcase/[showcaseId]/page.tsx");

  it("a layer is keyed on itself, so nothing remounts under the reader", () => {
    expect(stack).toContain("key={layer.id}");
    /*
     * The prop is gone from both halves, or the remount comes back. Pinned as
     * the declaration and the interpolation rather than the word "version",
     * which the comment explaining all this also contains — a file-wide check
     * for it passed with the prop still in place.
     */
    expect(stack).not.toContain("version?:");
    expect(stack).not.toContain("${version}");
    expect(viewer).not.toContain("version={");
  });

  it("the author is told who they are, everywhere it decides something", () => {
    // The slider, countdown and add yours already knew. These three did not,
    // which is why you could vote on your own poll.
    for (const call of ["<ShowPoll", "<ShowQuiz", "<ShowQuestion"]) {
      const at = stack.indexOf(call);
      expect(at, call).toBeGreaterThan(-1);
      expect(stack.slice(at, stack.indexOf("/>", at)), call).toContain("isAuthor={isAuthor}");
    }
  });

  it("the hype average is the brand's lime, not the look's own colour", () => {
    // One mark on a sticker speaks for everybody rather than the reader, and
    // on half the looks a white tick at 0.7 opacity was invisible.
    expect(stickers).toContain('const HYPE_LIME = "#a3e635";');
    expect(stickers).toContain("background: HYPE_LIME,");
    // Drawn for the author too: it is the only number their own slider has.
    expect(stickers).not.toContain("{sent && !isAuthor && (");
  });

  it("and the star springs only once the thumb has let go", () => {
    // During the drag it must sit exactly under the finger.
    expect(stickers).toContain('transition: settling ? "left 420ms cubic-bezier(.34,1.56,.64,1)" : undefined');
    const down = stickers.slice(stickers.indexOf("onPointerDown={(e) => {"));
    expect(down.slice(0, 260)).toContain("setSettling(false);");
  });

  it("the tray greys out at the cap, and says why", () => {
    expect(editor).toContain("full={full}");
    // Both rows: the tags grid and the pinned board. Asserting one let the
    // other be removed with the test still passing.
    expect(tray.match(/disabled=\{full\}/g)).toHaveLength(2);
    expect(tray).toContain("{MAX_LAYERS} of {MAX_LAYERS} stickers");
  });

  it("and the author's own stickers refuse the tap, not just hide the button", () => {
    /*
     * The disabled attribute is the appearance; these guards are the rule.
     * Mutating either one on its own left every test passing, because the
     * buttons were still disabled — and a disabled button is one keyboard
     * event or one stray call away from not being a guard at all. The
     * server-side half comes with 0194.
     */
    const pollGuard = poll.slice(poll.indexOf("async function choose"));
    expect(pollGuard.slice(0, 120)).toContain("if (busy || isAuthor) return;");
    const quizGuard = stickers.slice(stickers.indexOf("async function choose"));
    expect(quizGuard.slice(0, 160)).toContain("mine !== null || isAuthor) return;");
  });

  it("a refused hype puts the star back where the server has it", () => {
    // The silent failure this replaces was the worst of the three: the star
    // stayed where the thumb let go, recording nothing and saying nothing.
    const send = stickers.slice(stickers.indexOf("async function send(v: number)"));
    const body = send.slice(0, send.indexOf("const d = data"));
    expect(body).toContain("put(was === v ? seed.pick : was);");
    expect(body).toContain("setProblem(stickerError(error));");
  });

  it("a board asks for the layers it was leaving behind", () => {
    expect(board).toContain("track, layers)");
    expect(board).toContain("layers: boardLayers(r.media_url as string | null, show)");
  });
});

describe("a tap that did not reach the server", () => {
  it("says so", () => {
    expect(stickerError({ message: "network" })).toBe("Couldn't save that");
  });

  it("and says something different when it is only too fast", () => {
    // rate_limit() raises a check violation.
    expect(stickerError({ code: "23514", message: "rate" })).toBe("Slow down a moment");
  });

  it("nothing to say when nothing went wrong", () => {
    expect(stickerError(null)).toBeNull();
    expect(stickerError(undefined)).toBeNull();
  });

  it("and it never throws on a shape it did not expect", () => {
    expect(stickerError("boom")).toBe("Couldn't save that");
    expect(stickerError(42)).toBe("Couldn't save that");
    expect(stickerError({})).toBe("Couldn't save that");
  });
});
