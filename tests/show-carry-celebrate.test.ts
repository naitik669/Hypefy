// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { carryLayer, takeCarried } from "@/lib/show-carry";
import { AMBIENT_LOOK, MAX_LAYERS, type ShowLayer } from "@/lib/show-layers";

/**
 * Answering an Add yours, and the party a finished countdown throws.
 *
 * Joining used to drop you at a bare camera: your answer and the prompt it
 * answered were two posts that happened to mention each other. And a countdown
 * whose moment had passed simply read "It's happening", which is the quietest
 * possible way to say the thing has arrived.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const stickers = read("src/components/shows/ShowStickers.tsx");
const celebrate = read("src/components/shows/Celebrate.tsx");
const create = read("src/components/create/CreateScreen.tsx");
const editor = read("src/components/shows/ShowEditor.tsx");

const layer = (over: Partial<ShowLayer> = {}): ShowLayer =>
  ({
    id: "ay1",
    type: "addyours",
    x: 0.31,
    y: 0.77,
    scale: 1.4,
    rotation: -12,
    look: 2,
    payload: { prompt: "your best shot this week", collabId: "c-1" },
    ...over,
  }) as ShowLayer;

beforeEach(() => {
  sessionStorage.clear();
});

describe("the sticker comes with you", () => {
  it("in the place it was, at the angle it was, in the look it was", () => {
    // The geometry is the point: it is what makes the answer read as part of
    // the same thread rather than a separate post.
    carryLayer("c-1", layer());
    const [got] = takeCarried("c-1");
    expect(got.x).toBeCloseTo(0.31);
    expect(got.y).toBeCloseTo(0.77);
    expect(got.scale).toBeCloseTo(1.4);
    expect(got.rotation).toBeCloseTo(-12);
    expect(got.look).toBe(2);
  });

  it("and it is taken only once", () => {
    // Backing out and coming in again starts from a clean picture rather than
    // stacking the same sticker twice.
    carryLayer("c-1", layer());
    expect(takeCarried("c-1")).toHaveLength(1);
    expect(takeCarried("c-1")).toHaveLength(0);
  });

  it("nothing waiting is nothing carried", () => {
    expect(takeCarried("never-stored")).toEqual([]);
  });

  it("one collab's sticker is not another's", () => {
    carryLayer("c-1", layer());
    expect(takeCarried("c-2")).toEqual([]);
    expect(takeCarried("c-1")).toHaveLength(1);
  });

  it("an Ambient sticker loses its tint, so it re-colours to the new photo", () => {
    /*
     * Look 4 takes its colour from the photograph underneath, and the
     * photograph is about to be a different one — a carried tint would be the
     * old picture's colour on the new picture.
     */
    carryLayer("c-1", layer({ look: AMBIENT_LOOK, tint: "#aabbcc" }));
    const [got] = takeCarried("c-1");
    expect(got.look).toBe(AMBIENT_LOOK);
    expect(got.tint).toBeUndefined();
  });

  it("and a tint already sitting in storage is dropped on the way out too", () => {
    /*
     * Both ends strip it, and a check through carryLayer alone cannot tell
     * them apart — removing the one in takeCarried left every test passing.
     * This reaches it the only way anything can: storage written by something
     * other than the current code, which is the case it exists for.
     */
    sessionStorage.setItem(
      "hypefy:show-carry:v1",
      JSON.stringify({ "c-1": { ...layer({ look: AMBIENT_LOOK }), tint: "#aabbcc" } }),
    );
    const [got] = takeCarried("c-1");
    expect(got.tint).toBeUndefined();
  });

  it("whatever comes back out is validated, never trusted", () => {
    // sessionStorage is the viewer's own, and readLayers is the only
    // validator the layer model has.
    sessionStorage.setItem("hypefy:show-carry:v1", JSON.stringify({ "c-1": { id: "", type: "addyours" } }));
    expect(takeCarried("c-1")).toEqual([]);
  });

  it("and only ever an Add yours", () => {
    // Nothing else is carried by this route; a stored poll would be somebody
    // editing their own storage.
    carryLayer("c-1", layer({ type: "poll", payload: { question: "?", options: ["a", "b"] } }));
    expect(takeCarried("c-1")).toEqual([]);
  });

  it("storage being unavailable loses the sticker and nothing else", () => {
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("nope");
    };
    try {
      expect(() => carryLayer("c-1", layer())).not.toThrow();
    } finally {
      Storage.prototype.setItem = real;
    }
    expect(takeCarried("c-1")).toEqual([]);
  });
});

describe("both ends are wired", () => {
  it("the sticker stashes before it navigates", () => {
    const go = stickers.slice(stickers.indexOf("async function go()"));
    // To the navigation, not to the first closing brace — that one belongs to
    // the author's early return and cut the slice short of the line under test.
    const body = go.slice(0, go.indexOf("router.push(`/create") + 40);
    expect(body).toContain("if (layer) carryLayer(String(data), layer);");
    // Under the collab the server just handed back, not the payload's own.
    expect(body.indexOf("carryLayer")).toBeLessThan(body.indexOf("router.push(`/create"));
  });

  it("and the editor starts from it", () => {
    expect(create).toContain("takeCarried(collabId)");
    expect(create).toContain("initial={carried}");
    expect(editor).toContain("useState<ShowLayer[]>(initial)");
  });

  it("a carried sticker counts against the cap like any other", () => {
    // It is in `layers` from the first render, so `full` and the twelve-layer
    // ceiling see it without anything special.
    expect(editor).toContain("const full = layers.length >= MAX_LAYERS;");
    expect(MAX_LAYERS).toBe(12);
  });
});

describe("a finished countdown runs out and the Show celebrates", () => {
  it("the last seconds walk down before the party", () => {
    expect(stickers).toContain("const RUN_FROM = 3;");
    expect(stickers).toContain("setRunOut((n) => n - 1)");
    expect(stickers).toContain('{cell(runOut, "SEC")}');
  });

  it("the party is derived from the run-out, not stored", () => {
    // Stored, it had to be set from inside the effect that counts down —
    // a cascading render for something already known.
    expect(stickers).toContain("const partied = left.ended && live && runOut <= 0;");
    expect(stickers).toContain("{partied && <Celebrate />}");
  });

  it("and only on a Show somebody is watching", () => {
    // In the tray and the editor a finished countdown is a shape being
    // arranged; confetti over the picture you are decorating would be absurd.
    expect(stickers).toContain("const live = !preview && !!showId;");
  });

  it("it takes itself down, and never comes up for reduced motion", () => {
    expect(celebrate).toContain("setTimeout(() => setDone(true), LIFE_MS)");
    expect(celebrate).toContain('"(prefers-reduced-motion: reduce)"');
    expect(celebrate).toContain("if (done || calm) return null;");
  });

  it("and it is bounded, because this viewer already runs a clock, a video and a song", () => {
    // The audit that preceded this found the freezes came from unbounded DOM
    // and unbounded live media.
    expect(celebrate).toContain("const PIECES = 42;");
    const pieces = Number(/const PIECES = (\d+);/.exec(celebrate)![1]);
    expect(pieces).toBeLessThanOrEqual(64);
  });

  it("falling and turning are two elements, or neither happens", () => {
    /*
     * Both animations on one element means one transform wins and the pieces
     * drop without rotating. Asserted as the two `animation:` declarations,
     * not as the two names — the @keyframes blocks carry the names too, so a
     * check for those passed with the spin never applied to anything.
     */
    expect(celebrate).toContain("animation: `show-confetti-fall");
    expect(celebrate).toContain("animation: `show-confetti-spin");
  });

  it("every piece is placed from its index, so there is nothing to hydrate", () => {
    // The call, not the name: the comment explaining the choice says
    // "Math.random" too, so the bare name passed with the calls still there.
    expect(celebrate).not.toContain("Math.random(");
  });
});
