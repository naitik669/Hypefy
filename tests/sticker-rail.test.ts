import { describe, it, expect } from "vitest";
import { FIRST_SHELF, emptyShelfText, railItems, sameShelf, settleShelf } from "@hypefy/core/sticker-rail";

/**
 * The drawer's rail, as a list (27 Nov, "Packs & the drawer rail"):
 * Recent, Favourites, Yours, then a cover per pack, then the plus.
 */
describe("the rail", () => {
  it("is the three shelves and nothing else while there are no packs and none can be made", () => {
    expect(railItems([], false)).toEqual([
      { kind: "shelf", shelf: "recent", label: "Recent" },
      { kind: "shelf", shelf: "favourites", label: "Favourites" },
      { kind: "shelf", shelf: "yours", label: "Yours" },
    ]);
  });

  it("puts packs after the shelves, in the order given, and the plus last", () => {
    const items = railItems([{ id: "p1", name: "Soft hours" }, { id: "p2", name: "Pets" }], true);
    expect(items.map((i) => (i.kind === "shelf" ? i.shelf : i.kind === "pack" ? i.packId : i.kind))).toEqual([
      "recent", "favourites", "yours", "sep", "p1", "p2", "new",
    ]);
    expect(items[4]).toEqual({ kind: "pack", packId: "p1", label: "Soft hours" });
  });

  it("has a plus only when a pack can be made", () => {
    expect(railItems([{ id: "p1", name: "A" }], false).some((i) => i.kind === "new")).toBe(false);
    expect(railItems([], true).at(-1)).toEqual({ kind: "new", label: "New pack" });
  });

  it("opens on Recent", () => {
    expect(FIRST_SHELF).toEqual({ kind: "recent" });
  });
});

describe("which shelf is showing", () => {
  it("a pack is the same shelf only if it is the same pack", () => {
    expect(sameShelf({ kind: "pack", packId: "a" }, { kind: "pack", packId: "a" })).toBe(true);
    expect(sameShelf({ kind: "pack", packId: "a" }, { kind: "pack", packId: "b" })).toBe(false);
    expect(sameShelf({ kind: "yours" }, { kind: "yours" })).toBe(true);
    expect(sameShelf({ kind: "yours" }, { kind: "recent" })).toBe(false);
  });

  it("a pack that has gone falls back to Recent; one that is there stays", () => {
    expect(settleShelf({ kind: "pack", packId: "gone" }, [{ id: "p1", name: "A" }])).toEqual({ kind: "recent" });
    expect(settleShelf({ kind: "pack", packId: "p1" }, [{ id: "p1", name: "A" }])).toEqual({ kind: "pack", packId: "p1" });
    expect(settleShelf({ kind: "favourites" }, [])).toEqual({ kind: "favourites" });
  });

  it("every shelf has its own words for being empty", () => {
    const words = (["recent", "favourites", "yours"] as const).map((k) => emptyShelfText({ kind: k }));
    words.push(emptyShelfText({ kind: "pack", packId: "x" }));
    expect(new Set(words).size).toBe(4);
    expect(emptyShelfText({ kind: "favourites" })).toMatch(/Hold a sticker/);
  });
});
