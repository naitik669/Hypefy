import { pickProblem } from "@/lib/pick-check";

/**
 * An album: several photos or clips from the gallery, put up as Shows one
 * after another.
 *
 * Someone's Shows already play as one reel you tap through, so an album of
 * three is three Shows in a row — no new kind of row, and the viewer, the
 * seen ring, the viewers list and hype all work on each one as they are.
 */

export const ALBUM_MAX = 10;

export type AlbumPick = { id: string; file: File };

/**
 * Picks added from the system picker, in the order they came, checked one by
 * one. Those that cannot be a Show are named rather than dropped silently,
 * and anything past the cap is counted.
 */
export function addPicks(
  current: AlbumPick[],
  files: File[],
  makeId: () => string,
  max = ALBUM_MAX,
): { picks: AlbumPick[]; selected: string[]; refused: string[]; overCap: number } {
  const picks = [...current];
  const added: string[] = [];
  const refused: string[] = [];
  let overCap = 0;
  for (const file of files) {
    const problem = pickProblem(file, "show");
    if (problem) {
      refused.push(problem);
      continue;
    }
    if (picks.length >= max) {
      overCap++;
      continue;
    }
    const id = makeId();
    picks.push({ id, file });
    added.push(id);
  }
  return { picks, selected: added, refused, overCap };
}

/**
 * Tapping one: in or out of the album. The order is the order they were
 * chosen in, so taking one out moves those after it up a place.
 */
export function toggleSelected(order: string[], id: string, max = ALBUM_MAX): string[] {
  if (order.includes(id)) return order.filter((x) => x !== id);
  if (order.length >= max) return order;
  return [...order, id];
}

/** The picks that are in, in album order. */
export function selectedPicks(picks: AlbumPick[], order: string[]): AlbumPick[] {
  const byId = new Map(picks.map((p) => [p.id, p]));
  return order.map((id) => byId.get(id)).filter((p): p is AlbumPick => !!p);
}
