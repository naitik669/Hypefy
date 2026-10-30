import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { readLayers } from "@/lib/show-layers";
import { cardProblem, tidyCard, blankCard, type CardLayer } from "@/components/shows/CardEditor";
import { countdownParts, onInk, quizMark, readStickerState } from "@/lib/show-stickers";
import { publishShow } from "@/lib/show-publish";

const layer = (type: string, payload: unknown) => ({ id: `${type}1`, type, x: 0.5, y: 0.5, scale: 1, rotation: 0, look: 0, payload });
const card = (type: string, payload: unknown) => layer(type, payload) as CardLayer;
const NOW = Date.parse("2026-10-30T12:00:00.000Z");

describe("the four live stickers, as stored", () => {
  it("a quiz keeps its right answer, and one pointing nowhere is refused", () => {
    expect(readLayers([layer("quiz", { question: "Age?", options: ["19", "22"], answer: 1 })])[0].payload).toEqual({ question: "Age?", options: ["19", "22"], answer: 1 });
    expect(readLayers([layer("quiz", { question: "Age?", options: ["19", "22"], answer: 2 })])).toEqual([]);
    // Options that would tidy into a different order would move the answer.
    expect(readLayers([layer("quiz", { question: "Age?", options: ["19", "19", "22"], answer: 2 })])).toEqual([]);
  });

  it("a slider, a countdown and an Add yours prompt read back", () => {
    const out = readLayers([
      layer("slider", { prompt: "How hyped?" }),
      layer("countdown", { title: "Goa", at: "2026-11-02T10:00:00Z" }),
      layer("addyours", { prompt: "Your desk", collabId: "11111111-2222-3333-4444-555555555555" }),
      { ...layer("addyours", { prompt: "No collab yet" }), id: "addyours2" },
    ]);
    expect(out.map((l) => l.payload)).toEqual([
      { prompt: "How hyped?" },
      { title: "Goa", at: "2026-11-02T10:00:00.000Z" },
      { prompt: "Your desk", collabId: "11111111-2222-3333-4444-555555555555" },
      { prompt: "No collab yet" },
    ]);
  });

  it("an Add yours collab id is only ever a uuid", () => {
    expect(readLayers([layer("addyours", { prompt: "x", collabId: "'; drop" })])[0].payload).toEqual({ prompt: "x" });
  });
});

describe("writing them on the sticker", () => {
  it("a quiz needs its right answer marked, and the mark follows its option", () => {
    expect(cardProblem(card("quiz", { question: "Q", options: ["a", "b"], answer: -1 }))).toBe("Tap ✓ next to the right answer.");
    expect(cardProblem(card("quiz", { question: "Q", options: ["a", "A"], answer: 0 }))).toBe("Make the options different from each other.");
    const done = tidyCard(card("quiz", { question: " Q ", options: ["", "a", "b"], answer: 2 }));
    expect(done.payload).toEqual({ question: "Q", options: ["a", "b"], answer: 1 });
  });

  it("a countdown needs a name and a time still to come", () => {
    expect(cardProblem(card("countdown", { title: "", at: "2026-11-01T00:00:00Z" }), NOW)).toBe("Name what's coming.");
    expect(cardProblem(card("countdown", { title: "Goa", at: "2026-10-01T00:00:00Z" }), NOW)).toBe("Pick a time that hasn't happened yet.");
    expect(cardProblem(card("countdown", { title: "Goa", at: "2026-11-01T00:00:00Z" }), NOW)).toBeNull();
  });

  it("each starts blank, a countdown on this time tomorrow", () => {
    expect(blankCard("quiz")).toEqual({ question: "", options: ["", ""], answer: -1 });
    expect((blankCard("countdown", NOW) as { at: string }).at).toBe("2026-10-31T12:00:00.000Z");
  });
});

describe("the arithmetic", () => {
  it("counts down in days, hours and minutes, then ends", () => {
    expect(countdownParts("2026-11-01T14:30:00Z", NOW)).toEqual({ days: 2, hours: 2, minutes: 30, ended: false });
    expect(countdownParts("2026-10-30T11:00:00Z", NOW).ended).toBe(true);
  });

  it("marks a quiz only once answered: the right one, and your wrong one", () => {
    expect(quizMark(0, 1, null)).toBeNull();
    expect(quizMark(1, 1, 0)).toBe("right");
    expect(quizMark(0, 1, 0)).toBe("wrong");
    expect(quizMark(2, 1, 0)).toBeNull();
  });

  it("reads the server's sticker state defensively", () => {
    expect(readStickerState(null)).toEqual({ sliders: {}, reminders: [], added: {} });
    expect(readStickerState({ sliders: { s: { avg: "64", count: 3, mine: 80 } }, reminders: ["c", 4], added: { a: "2" } })).toEqual({
      sliders: { s: { avg: 64, count: 3, mine: 80 } },
      reminders: ["c"],
      added: { a: 2 },
    });
  });

  it("an icon on a button keeps contrast whatever the colour", () => {
    expect(onInk("#0a0a0a")).toBe("#ffffff");
    expect(onInk("#ffffff")).toBe("#0a0a0a");
    expect(onInk("#a3e635")).toBe("#0a0a0a");
  });
});

describe("publishing an Add yours prompt", () => {
  function client({ collabFails = false, insertFails = false } = {}) {
    const rpc = vi.fn(async (name: string) =>
      name === "create_show_collab" ? (collabFails ? { data: null, error: { message: "x" } } : { data: "11111111-2222-3333-4444-555555555555", error: null }) : { data: null, error: null },
    );
    const inserted: Record<string, unknown>[] = [];
    const bucket = {
      upload: async () => ({ error: null }),
      getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn/${p}` } }),
      remove: vi.fn(async () => ({ error: null })),
    };
    const c = {
      rpc,
      storage: { from: () => bucket },
      from: () => ({
        insert: (row: Record<string, unknown>) => {
          inserted.push(row);
          return { select: () => ({ single: async () => (insertFails ? { data: null, error: { code: "x" } } : { data: { id: "s1" }, error: null }) }) };
        },
      }),
    };
    return { c: c as never, rpc, inserted, bucket };
  }
  const draft = {
    userId: "u1",
    file: new File(["x"], "a.jpg", { type: "image/jpeg" }),
    caption: "",
    track: null,
    layers: readLayers([layer("addyours", { prompt: "Your desk setup" })]),
    audience: "everyone" as const,
    hiddenFrom: [],
  };

  it("makes the shared Show the answers go into, named after the prompt, and stores it on the sticker", async () => {
    const f = client();
    expect(await publishShow(f.c, draft)).toEqual({ ok: true, id: "s1" });
    expect(f.rpc).toHaveBeenCalledWith("create_show_collab", { p_title: "Your desk setup" });
    expect((f.inserted[0].layers as { payload: unknown }[])[0].payload).toEqual({ prompt: "Your desk setup", collabId: "11111111-2222-3333-4444-555555555555" });
  });

  it("if the Show does not go up, that shared Show is closed again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const f = client({ insertFails: true });
    expect((await publishShow(f.c, draft)).ok).toBe(false);
    expect(f.rpc).toHaveBeenCalledWith("leave_show_collab", { p_collab: "11111111-2222-3333-4444-555555555555" });
  });

  it("and if it cannot be made, nothing is posted", async () => {
    const f = client({ collabFails: true });
    expect(await publishShow(f.c, draft)).toEqual({ ok: false, reason: "prompt" });
    expect(f.inserted).toHaveLength(0);
    expect(f.bucket.remove).toHaveBeenCalled();
  });
});

describe("the migration", () => {
  const sql = readFileSync("supabase/migrations/0188_show_interactive_stickers.sql", "utf8");
  it("lets a viewer into an Add yours shared Show only if it is the Show author's", () => {
    expect(sql).toContain("and c.owner_id = s.user_id");
  });
  it("makes a quiz answer final and its right answer unrewritable once answered", () => {
    expect(sql).toContain("if v_layer ->> 'type' = 'quiz' and v_answered then");
    expect(sql).toContain("or (v_old -> 'payload' -> 'answer') is distinct from (v_new -> 'payload' -> 'answer') then");
  });
  it("keeps the author off their own slider, and the list of who slid for the author alone", () => {
    expect(sql).toContain("if v_author = v_me then raise exception");
    expect(sql).toContain("and s.user_id = (select auth.uid())");
  });
});
