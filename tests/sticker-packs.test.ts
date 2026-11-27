import { describe, it, expect } from "vitest";
import {
  checkPackName,
  formatPackCode,
  normalisePackCode,
  packByline,
  packCover,
  packLink,
  pickedLabel,
  pickerSources,
  readPack,
  readPacks,
  togglePick,
} from "@hypefy/core/sticker-packs";
import { readStickerRow, type Sticker } from "@hypefy/core/stickers";
import {
  addToPack,
  createPack,
  deletePack,
  listMyPacks,
  listReceivedStickers,
  removeFromPack,
  renamePack,
  unsavePack,
} from "@/lib/sticker-pack-store";

/** Sticker packs (0224): reading the server's shapes and the picker's rules. */

const UID = "11111111-2222-3333-4444-555555555555";
const st = (n: number): Sticker =>
  readStickerRow({ id: `0000000${n}-0000-0000-0000-000000000000`, path: `${UID}/0000000${n}-0000-0000-0000-000000000000.webp`, edge: "stroke", width: 10, height: 10 })!;
const raw = (over: Record<string, unknown> = {}) => ({
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  name: "Soft hours",
  code: "K7Q2M9XD",
  audience: "people",
  cover_sticker_id: st(2).id,
  owner: { id: UID, username: "aman", display_name: "AMAN" },
  mine: false,
  saved: true,
  fresh: true,
  stickers: [st(1), st(2), { id: "broken" }],
  ...over,
});

describe("reading a pack", () => {
  it("takes every field from the server, and drops a sticker it cannot read", () => {
    const p = readPack(raw())!;
    expect(p).toMatchObject({ id: raw().id, name: "Soft hours", code: "K7Q2M9XD", audience: "people", coverStickerId: st(2).id, mine: false, saved: true, fresh: true });
    expect(p.owner).toEqual({ id: UID, username: "aman", displayName: "AMAN" });
    expect(p.stickers).toEqual([st(1), st(2)]);
  });

  it("mine, saved and fresh are true only when the server says true", () => {
    const p = readPack(raw({ mine: "yes", saved: 1, fresh: null }))!;
    expect([p.mine, p.saved, p.fresh]).toEqual([false, false, false]);
  });

  it("only people is people; anything else is a link pack", () => {
    expect(readPack(raw({ audience: "people" }))!.audience).toBe("people");
    expect(readPack(raw({ audience: "link" }))!.audience).toBe("link");
    expect(readPack(raw({ audience: "everyone" }))!.audience).toBe("link");
  });

  it("anything that is not a pack reads as null, and a list skips it", () => {
    expect(readPack(null)).toBe(null);
    expect(readPack(raw({ code: "K7Q2M9X0" }))).toBe(null); // 0 is never in a code
    expect(readPack(raw({ owner: null }))).toBe(null);
    expect(readPack(raw({ name: 3 }))).toBe(null);
    expect(readPacks([raw(), { id: 1 }, raw({ id: "b" })]).map((p) => p.id)).toEqual([raw().id, "b"]);
    expect(readPacks(null)).toEqual([]);
  });
});

describe("the cover", () => {
  it("the chosen one in front, then the next ones in, three at most", () => {
    const s = [st(1), st(2), st(3), st(4)];
    expect(packCover(s, st(3).id).map((x) => x.id)).toEqual([st(3), st(1), st(2)].map((x) => x.id));
  });
  it("no choice, or a choice no longer in the pack, is the first three", () => {
    const s = [st(1), st(2), st(3), st(4)];
    expect(packCover(s, null)).toEqual([st(1), st(2), st(3)]);
    expect(packCover(s, st(9).id)).toEqual([st(1), st(2), st(3)]);
  });
});

describe("the code", () => {
  it("is shown in two halves", () => {
    expect(formatPackCode("K7Q2M9XD")).toBe("K7Q2-M9XD");
  });
  it("is read back whatever the case, spaces or dashes", () => {
    for (const t of ["K7Q2M9XD", "k7q2-m9xd", " k7q2 m9xd ", "K7Q2—M9XD"]) expect(normalisePackCode(t)).toBe("K7Q2M9XD");
  });
  it("never guesses at a character that is not in the alphabet", () => {
    expect(normalisePackCode("K7Q2M9X0")).toBe(null);
    expect(normalisePackCode("K7Q2M9XO")).toBe(null);
    expect(normalisePackCode("K7Q2M9X1")).toBe(null);
    expect(normalisePackCode("K7Q2M9XI")).toBe(null);
    expect(normalisePackCode("K7Q2M9X")).toBe(null);
    expect(normalisePackCode("K7Q2M9XDD")).toBe(null);
  });
  it("is the end of the link", () => {
    expect(packLink("https://app.hypefy.chat/", "K7Q2M9XD")).toBe("https://app.hypefy.chat/stickers/p/K7Q2M9XD");
  });
});

describe("the name", () => {
  it("is trimmed, needed, and 40 at most", () => {
    expect(checkPackName("  Dogs ")).toEqual({ ok: true, name: "Dogs" });
    expect(checkPackName("   ").ok).toBe(false);
    expect(checkPackName("x".repeat(40)).ok).toBe(true);
    expect(checkPackName("x".repeat(41)).ok).toBe(false);
  });
});

describe("the picker", () => {
  it("Saved is what you were sent plus favourites, minus your own, each once", () => {
    const src = pickerSources({
      yours: [st(1), st(2)],
      favourites: [st(3), st(1)],
      received: [st(4), st(3), st(2)],
      packs: [readPack(raw({ stickers: [st(5), st(1)] }))!, readPack(raw({ id: "b", stickers: [st(5)] }))!],
    });
    expect(src.yours).toEqual([st(1), st(2)]);
    expect(src.saved).toEqual([st(4), st(3)]);
    expect(src.inPacks).toEqual([st(5), st(1)]);
  });

  it("tap ticks, tap again unticks, in the order tapped", () => {
    let p: string[] = [];
    p = togglePick(p, "a");
    p = togglePick(p, "b");
    p = togglePick(p, "c");
    p = togglePick(p, "b");
    expect(p).toEqual(["a", "c"]);
  });

  it("a tick past the room is refused, and nothing ticked is dropped", () => {
    expect(togglePick(["a", "b"], "c", 2)).toEqual(["a", "b"]);
    expect(togglePick(["a", "b"], "a", 2)).toEqual(["b"]);
    expect(togglePick(Array.from({ length: 30 }, (_, i) => `s${i}`), "x")).toHaveLength(30);
  });

  it("says how many and the range", () => {
    expect(pickedLabel(4)).toBe("4 picked · 2 to 30");
  });
});

describe("who made it", () => {
  it("yours, or by their name, with the count", () => {
    expect(packByline(readPack(raw({ mine: true }))!)).toBe("2 stickers · yours");
    expect(packByline(readPack(raw())!)).toBe("2 stickers · by AMAN");
    expect(packByline(readPack(raw({ owner: { id: UID, username: "aman", display_name: null }, stickers: [st(1)] }))!)).toBe("1 sticker · by @aman");
  });
});

// ── The calls, with a fake client ───────────────────────────────────────

function fake(answer: { data: unknown; error: { message: string } | null }) {
  const calls: unknown[][] = [];
  const q: Record<string, unknown> = {};
  for (const op of ["select", "eq", "neq", "is", "order", "limit"]) q[op] = (...a: unknown[]) => { calls.push([op, ...a]); return q; };
  q.then = (res: (v: unknown) => void) => res(answer);
  const client = {
    from: (t: string) => { calls.push(["from", t]); return q; },
    rpc: async (...a: unknown[]) => { calls.push(["rpc", ...a]); return answer; },
  };
  return { client: client as never, calls };
}

describe("the pack calls", () => {
  it("the rail reads my_sticker_packs; a refusal is a failure", async () => {
    const f = fake({ data: [raw()], error: null });
    expect(await listMyPacks(f.client)).toMatchObject({ ok: true, value: [{ id: raw().id }] });
    expect(f.calls).toEqual([["rpc", "my_sticker_packs"]]);
    expect(await listMyPacks(fake({ data: null, error: { message: "denied" } }).client)).toEqual({ ok: false, error: "denied" });
  });

  it("each write names its function and arguments, and hands back the server's pack", async () => {
    const cases: [() => Promise<unknown>, unknown[]][] = [];
    const f = fake({ data: raw(), error: null });
    cases.push([() => createPack(f.client, { name: "N", audience: "link", stickerIds: ["a", "b"], coverStickerId: null }), ["rpc", "create_sticker_pack", { p_name: "N", p_audience: "link", p_sticker_ids: ["a", "b"], p_cover_sticker_id: undefined }]]);
    cases.push([() => createPack(f.client, { name: "N", audience: "people", stickerIds: ["a", "b"], coverStickerId: "b" }), ["rpc", "create_sticker_pack", { p_name: "N", p_audience: "people", p_sticker_ids: ["a", "b"], p_cover_sticker_id: "b" }]]);
    cases.push([() => renamePack(f.client, "p", "M"), ["rpc", "rename_sticker_pack", { p_pack_id: "p", p_name: "M" }]]);
    cases.push([() => addToPack(f.client, "p", ["c"]), ["rpc", "add_stickers_to_pack", { p_pack_id: "p", p_sticker_ids: ["c"] }]]);
    cases.push([() => removeFromPack(f.client, "p", "c"), ["rpc", "remove_sticker_from_pack", { p_pack_id: "p", p_sticker_id: "c" }]]);
    for (const [run, call] of cases) {
      f.calls.length = 0;
      const r = (await run()) as { ok: boolean; value: { id: string } };
      expect(f.calls).toEqual([call]);
      expect(r.ok).toBe(true);
      expect(r.value.id).toBe(raw().id);
    }
  });

  it("a write the server refuses is a failure with its words; an unreadable answer is a failure too", async () => {
    expect(await removeFromPack(fake({ data: null, error: { message: "A pack has 2 to 30 stickers." } }).client, "p", "c")).toEqual({ ok: false, error: "A pack has 2 to 30 stickers." });
    expect((await addToPack(fake({ data: { nope: 1 }, error: null }).client, "p", ["c"])).ok).toBe(false);
  });

  it("delete and remove name the pack, and report a refusal", async () => {
    const f = fake({ data: null, error: null });
    expect(await deletePack(f.client, "p")).toEqual({ ok: true, value: null });
    expect(await unsavePack(f.client, "p")).toEqual({ ok: true, value: null });
    expect(f.calls).toEqual([["rpc", "delete_sticker_pack", { p_pack_id: "p" }], ["rpc", "unsave_sticker_pack", { p_pack_id: "p" }]]);
    expect(await deletePack(fake({ data: null, error: { message: "No such pack" } }).client, "p")).toEqual({ ok: false, error: "No such pack" });
  });

  it("Saved reads sticker messages sent by other people, not unsent, not removed", async () => {
    const msg = { kind: "sticker", is_unsent: false, metadata: { sticker_id: st(1).id, path: st(1).path, edge: "stroke", w: 10, h: 10 } };
    const f = fake({ data: [msg, msg], error: null });
    const r = await listReceivedStickers(f.client, UID);
    expect(r).toEqual({ ok: true, value: [st(1)] });
    expect(f.calls).toContainEqual(["neq", "sender_id", UID]);
    expect(f.calls).toContainEqual(["eq", "kind", "sticker"]);
    expect(f.calls).toContainEqual(["eq", "is_unsent", false]);
    expect(f.calls).toContainEqual(["is", "removed_at", null]);
    expect(await listReceivedStickers(fake({ data: null, error: { message: "denied" } }).client, UID)).toEqual({ ok: false, error: "denied" });
  });
});
