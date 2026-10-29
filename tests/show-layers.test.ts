import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  LAYER_POS_MAX,
  LAYER_POS_MIN,
  LAYER_SCALE_MAX,
  LAYER_SCALE_MIN,
  LAYER_TYPES,
  LOOKS,
  MAX_LAYERS,
  MAX_LAYER_TEXT,
  layerBox,
  nextLook,
  readLayers,
  type ShowLayer,
} from "@/lib/show-layers";

/**
 * The layer list is read out of a jsonb column, which means it can hold a
 * row written by an older client, a half-written row, or one from a
 * version that does not exist yet. All of those must read as "not a
 * layer" and leave the picture standing — the stance readPoll takes, for
 * the same reason.
 *
 * The column's own bounds were dry-run against the live database inside a
 * rolled-back transaction: an object instead of an array refused, thirteen
 * layers refused, twelve allowed, a 40 KB payload refused, and a Show with
 * no layers defaulting to [].
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

const layer = (over: Record<string, unknown> = {}) => ({
  id: "a",
  type: "text",
  x: 0.5,
  y: 0.5,
  scale: 1,
  rotation: 0,
  look: 0,
  payload: { text: "hello" },
  ...over,
});

const one = (over: Record<string, unknown> = {}): ShowLayer | undefined =>
  readLayers([layer(over)])[0];

describe("reading a layer list", () => {
  it("a good layer comes back whole", () => {
    expect(readLayers([layer()])).toEqual([
      { id: "a", type: "text", x: 0.5, y: 0.5, scale: 1, rotation: 0, look: 0, payload: { text: "hello" } },
    ]);
  });

  it("anything that is not a list is no layers", () => {
    for (const bad of [null, undefined, 0, "", "[]", {}, { 0: layer() }, true]) {
      expect(readLayers(bad)).toEqual([]);
    }
  });

  it("and a bad layer is skipped, not fatal to the good ones", () => {
    const list = readLayers([layer({ id: "a" }), null, { nonsense: true }, layer({ id: "b" })]);
    expect(list.map((l) => l.id)).toEqual(["a", "b"]);
  });

  it("an unknown type is not a layer", () => {
    expect(readLayers([layer({ type: "hologram" })])).toEqual([]);
    expect(readLayers([layer({ type: null })])).toEqual([]);
  });

  it("a layer with no id, or a repeated one, is dropped", () => {
    // Ids are what a vote and an answer point at; two layers cannot share.
    expect(readLayers([layer({ id: "" })])).toEqual([]);
    expect(readLayers([layer({ id: 7 })])).toEqual([]);
    expect(readLayers([layer({ id: "a" }), layer({ id: "a" })]).length).toBe(1);
  });

  it("and the list stops at the cap", () => {
    const many = Array.from({ length: MAX_LAYERS + 6 }, (_, i) => layer({ id: `l${i}` }));
    expect(readLayers(many).length).toBe(MAX_LAYERS);
  });

  it("order is kept, because it is the stacking order", () => {
    const list = readLayers([layer({ id: "under" }), layer({ id: "over" })]);
    expect(list.map((l) => l.id)).toEqual(["under", "over"]);
  });
});

describe("the numbers are brought into range rather than believed", () => {
  it("position is clamped a little outside the frame", () => {
    expect(one({ x: 99 })?.x).toBe(LAYER_POS_MAX);
    expect(one({ y: -99 })?.y).toBe(LAYER_POS_MIN);
  });

  it("scale is clamped", () => {
    expect(one({ scale: 1000 })?.scale).toBe(LAYER_SCALE_MAX);
    expect(one({ scale: 0 })?.scale).toBe(LAYER_SCALE_MIN);
  });

  it("rotation wraps, so turning right round comes back", () => {
    // Clamping would stick a sticker at 180 and make it feel broken.
    expect(one({ rotation: 0 })?.rotation).toBe(0);
    expect(one({ rotation: 190 })?.rotation).toBe(-170);
    expect(one({ rotation: -190 })?.rotation).toBe(170);
    expect(one({ rotation: 360 })?.rotation).toBe(0);
    expect(one({ rotation: 720 + 45 })?.rotation).toBe(45);
  });

  it("and nonsense falls back instead of poisoning the layer", () => {
    for (const bad of [NaN, Infinity, -Infinity, "0.5", null, undefined]) {
      const l = one({ x: bad, y: bad, scale: bad, rotation: bad });
      expect(l?.x).toBe(0.5);
      expect(l?.scale).toBe(1);
      expect(l?.rotation).toBe(0);
    }
  });

  it("a look out of range reads as the first, not as no layer", () => {
    // A look added and later removed must not delete somebody's Show.
    expect(one({ look: 99 })?.look).toBe(0);
    expect(one({ look: -1 })?.look).toBe(0);
    expect(one({ look: 1.7 })?.look).toBe(1);
    expect(one({ look: 2 })?.look).toBe(2);
  });
});

describe("each type checks its own payload", () => {
  it("text is trimmed, flattened and capped", () => {
    expect(one({ payload: { text: "  two   words " } })?.payload).toEqual({ text: "two words" });
    expect(one({ payload: { text: "a\n\n\nb" } })?.payload).toEqual({ text: "a b" });
    const long = one({ payload: { text: "x".repeat(MAX_LAYER_TEXT + 50) } });
    expect((long?.payload as { text: string }).text).toHaveLength(MAX_LAYER_TEXT);
  });

  it("empty text is not a text layer", () => {
    expect(readLayers([layer({ payload: { text: "   " } })])).toEqual([]);
    expect(readLayers([layer({ payload: {} })])).toEqual([]);
  });

  it("a sticker is one emoji, not a sentence", () => {
    expect(one({ type: "sticker", payload: { emoji: "🔥" } })?.payload).toEqual({ emoji: "🔥" });
    // Counted in graphemes, so a flag or a family still passes.
    expect(one({ type: "sticker", payload: { emoji: "👩‍👩‍👧" } })).toBeTruthy();
    expect(readLayers([layer({ type: "sticker", payload: { emoji: "a whole sentence" } })])).toEqual([]);
  });

  it("music needs a title and an artist, or it is not drawn", () => {
    // A chip with no title is worse to draw than nothing.
    expect(one({ type: "music", payload: { id: "1", title: "T", artist: "A" } })?.payload).toEqual({
      id: "1", title: "T", artist: "A", artwork: null, preview: null,
    });
    expect(readLayers([layer({ type: "music", payload: { id: "1", title: "T" } })])).toEqual([]);
  });

  it("a mention is a handle in the shape the app uses", () => {
    expect(one({ type: "mention", payload: { username: " Riya " } })?.payload).toEqual({ username: "riya" });
    expect(one({ type: "mention", payload: { username: "crazie.extra" } })).toBeTruthy();
    for (const bad of ["", "has space", "@riya", "x".repeat(40)]) {
      expect(readLayers([layer({ type: "mention", payload: { username: bad } })]), bad).toEqual([]);
    }
  });

  it("a link must at least be an https URL", () => {
    // Whether the host is one we unfurl is link-preview's job, asked
    // again at render.
    expect(one({ type: "link", payload: { url: "https://bandcamp.com/x" } })).toBeTruthy();
    for (const bad of ["http://x.com", "javascript:alert(1)", "not a url", ""]) {
      expect(readLayers([layer({ type: "link", payload: { url: bad } })]), bad).toEqual([]);
    }
  });

  it("a poll borrows the chat poll's own rules", () => {
    const p = one({ type: "poll", payload: { question: "one more?", options: ["yes", "no"] } });
    expect(p?.payload).toEqual({ question: "one more?", options: ["yes", "no"] });
    // Fewer than two real options is not a poll.
    expect(readLayers([layer({ type: "poll", payload: { question: "q", options: ["only"] } })])).toEqual([]);
    // tidyOptions drops the duplicate, which takes it below two.
    expect(readLayers([layer({ type: "poll", payload: { question: "q", options: ["a", "a"] } })])).toEqual([]);
    expect(readLayers([layer({ type: "poll", payload: { question: "", options: ["a", "b"] } })])).toEqual([]);
  });

  it("a post or Shot embed is an id and nothing else", () => {
    expect(one({ type: "post", payload: { postId: "abc" } })?.payload).toEqual({ postId: "abc" });
    expect(readLayers([layer({ type: "post", payload: { postId: "" } })])).toEqual([]);
    expect(readLayers([layer({ type: "shot", payload: { shotId: 12 } })])).toEqual([]);
  });

  it("every type has a payload check and a look count", () => {
    // A type added to the union without either is a layer that cannot be
    // drawn or cannot be restyled.
    for (const t of LAYER_TYPES) {
      expect(LOOKS[t], t).toBeGreaterThan(0);
      expect(readLayers([layer({ type: t, payload: {} })]), t).toEqual([]);
    }
  });
});

describe("where a layer lands", () => {
  it("the centre is the anchor, so turning does not move it", () => {
    const box = layerBox({ x: 0.5, y: 0.25, scale: 2, rotation: 30 }, { width: 390, height: 844 });
    expect(box.left).toBe(195);
    expect(box.top).toBe(211);
    expect(box.transform).toBe("translate(-50%, -50%) rotate(30deg) scale(2)");
  });

  it("and the same layer lands proportionally in a bigger frame", () => {
    // One Show has to come out right in the editor, the viewer, a ring
    // preview and an exported image — four different widths.
    const small = layerBox({ x: 0.25, y: 0.5, scale: 1, rotation: 0 }, { width: 390, height: 844 });
    const big = layerBox({ x: 0.25, y: 0.5, scale: 1, rotation: 0 }, { width: 1080, height: 2337 });
    expect(small.left / 390).toBeCloseTo(big.left / 1080, 10);
    expect(small.top / 844).toBeCloseTo(big.top / 2337, 10);
  });
});

describe("tapping a layer", () => {
  it("runs through its looks and wraps", () => {
    expect(nextLook("text", 0)).toBe(1);
    expect(nextLook("text", LOOKS.text - 1)).toBe(0);
  });

  it("and survives a look index that is already nonsense", () => {
    for (const bad of [NaN, Infinity, -7, 99]) {
      const n = nextLook("music", bad as number);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(LOOKS.music);
    }
  });
});

describe("the column holds the coarse bounds", () => {
  const sql = read("supabase/migrations/0182_show_layers.sql");

  it("an array, bounded in count and in size", () => {
    expect(sql).toContain("jsonb_typeof(layers) = 'array'");
    expect(sql).toContain(`jsonb_array_length(layers) <= ${MAX_LAYERS}`);
    expect(sql).toContain("pg_column_size(layers) <= 24576");
  });

  it("but not a second copy of the payload rules", () => {
    // Postgres validating every shape would be a second readLayers that
    // could disagree with the first. Scoped to the constraint, not the
    // whole file: the comment above it explains that choice and so names
    // the very words this is looking for.
    const check = sql.slice(sql.indexOf("add constraint shows_layers_shape"), sql.indexOf(") not valid;"));
    expect(check).not.toContain("payload");
    expect(check).not.toContain("->>");
    expect(check).not.toContain("'text'");
  });

  it("validated without locking the table", () => {
    expect(sql).toContain("not valid;");
    expect(sql).toContain("validate constraint shows_layers_shape");
  });

  it("and the client is granted the column, which 0150 otherwise withholds", () => {
    expect(sql).toContain("grant insert (user_id, media_url, caption, track, linked_post_id, mentions, layers)");
    expect(sql).toContain("grant update (is_showcase, layers) on public.shows to authenticated;");
  });
});
