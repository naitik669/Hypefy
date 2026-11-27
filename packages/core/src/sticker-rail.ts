/**
 * The sticker drawer's rail (27 Nov design, "Packs & the drawer rail").
 *
 * On desktop a 62px column down the drawer's left; on the phone the same
 * icons in a row under the Stickers/GIFs switch, with no words. Either way
 * it is the same list, in the same order: Recent, Favourites, Yours, then a
 * cover per pack, then — once packs can be made — a dashed plus.
 *
 * It replaces the chips the drawer had. This file is the list and the
 * rules for which shelf is showing; the drawer only draws it.
 */

export type FixedShelf = "recent" | "favourites" | "yours";

export type Shelf = { kind: FixedShelf } | { kind: "pack"; packId: string };

/** The fixed shelves, in the order the rail shows them. */
export const FIXED_SHELVES: readonly FixedShelf[] = ["recent", "favourites", "yours"];

/**
 * Where the drawer opens. Always Recent: the sticker button opens Stickers ·
 * Recent, never GIFs and never wherever it was last left (Naitik, 27 Nov).
 */
export const FIRST_SHELF: Shelf = { kind: "recent" };

export const SHELF_LABEL: Record<FixedShelf, string> = {
  recent: "Recent",
  favourites: "Favourites",
  yours: "Yours",
};

export type RailPack = { id: string; name: string };

export type RailItem =
  | { kind: "shelf"; shelf: FixedShelf; label: string }
  | { kind: "pack"; packId: string; label: string }
  | { kind: "sep" }
  | { kind: "new"; label: string };

/**
 * Everything on the rail, in order. The plus is only there when there is
 * something for it to do: a button that opens nothing is worse than none.
 */
export function railItems(packs: readonly RailPack[], canMakePack: boolean): RailItem[] {
  const out: RailItem[] = FIXED_SHELVES.map((s) => ({ kind: "shelf", shelf: s, label: SHELF_LABEL[s] }));
  if (packs.length > 0 || canMakePack) out.push({ kind: "sep" });
  for (const p of packs) out.push({ kind: "pack", packId: p.id, label: p.name });
  if (canMakePack) out.push({ kind: "new", label: "New pack" });
  return out;
}

export function sameShelf(a: Shelf, b: Shelf): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind !== "pack" || a.packId === (b as { packId: string }).packId;
}

/**
 * The shelf to show once the packs are known. A pack that has gone — you
 * removed it, its maker deleted it — falls back to Recent rather than
 * leaving the drawer pointing at nothing.
 */
export function settleShelf(shelf: Shelf, packs: readonly RailPack[]): Shelf {
  if (shelf.kind !== "pack") return shelf;
  return packs.some((p) => p.id === shelf.packId) ? shelf : FIRST_SHELF;
}

/** What the empty shelf says, so an empty grid never reads as broken. */
export function emptyShelfText(shelf: Shelf): string {
  switch (shelf.kind) {
    case "recent":
      return "Stickers you send show up here.";
    case "favourites":
      return "Hold a sticker and add it to your favourites.";
    case "yours":
      return "Make your first one with Create.";
    case "pack":
      return "Nothing in this pack yet.";
  }
}
