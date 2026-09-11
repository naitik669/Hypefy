import { COLOR_GROUPS, DIARY_COLORS } from "@/components/diary/DiaryPage";
import type { createClient } from "@/lib/supabase/client";

/**
 * Saved folders — what the database calls collections.
 *
 * A folder holds posts and Shots, has a colour (a key from the same palette
 * as Spotlight pages) and an emoji, and sits in the order you gave it. Being
 * in a folder means being saved: see migration 0074.
 */

export type FolderCover = { kind: "post" | "shot"; thumb: string | null; video: string | null };

export type Folder = {
  id: string;
  name: string;
  emoji: string | null;
  color: string;
  position: number;
  coverUrl: string | null;
  itemCount: number;
  /** Its newest four, for the mosaic. */
  covers: FolderCover[];
};

/** The colours a folder can be — the page palette, less Ink. */
export const FOLDER_COLORS = DIARY_COLORS.filter((c) => c.key !== "ink");

/** The same groups as a page's colour line, less Ink, drawn as folder tiles. */
export function folderColorGroups() {
  return COLOR_GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    colors: g.colors.filter((c) => c.key !== "ink").map((c) => ({ key: c.key, label: c.label, background: folderFill(c.key).background })),
  }));
}

/**
 * The seven a new folder cycles through, one from each family and round the
 * wheel — and the ones a folder with no colour saved is drawn in, picked by
 * its id. The order must not change, or those older folders change colour.
 */
const DEFAULTS = (["plum", "cobalt", "teal", "forest", "moss", "ember", "rose"] as const).map(
  (k) => FOLDER_COLORS.find((c) => c.key === k)!
);

/** A colour for a new folder: the next one round the wheel. */
export function nextFolderColor(count: number): string {
  return DEFAULTS[count % DEFAULTS.length].key;
}

/** A folder's tile colour. Unknown or unset colours pick one from its id, so
 *  older folders are not all the same. */
export function folderFill(color: string | null | undefined, seed = "") {
  // "All saved": not a folder, so none of the folder colours — the app's
  // own dark with a breath of its lime.
  if (color === "all")
    return {
      key: "all",
      background: "radial-gradient(120% 90% at 0% 0%, rgb(163 230 53 / 0.2), transparent 60%), linear-gradient(160deg, #2a2a2a, #151515)",
      ink: "#a3e635",
    };
  const known = FOLDER_COLORS.find((c) => c.key === color);
  const c = known ?? DEFAULTS[[...seed].reduce((n, ch) => n + ch.charCodeAt(0), 0) % DEFAULTS.length];
  const h2 = c.hue2 ?? c.hue;
  const l = c.lum ?? 0;
  return {
    key: c.key,
    background: `radial-gradient(120% 90% at 0% 0%, hsl(${c.hue} ${c.sat + 12}% 60% / 0.5), transparent 62%), linear-gradient(160deg, hsl(${c.hue} ${c.sat}% ${34 + l}%), hsl(${h2} ${Math.max(0, c.sat - 6)}% ${(c.hue2 === undefined ? 17 : 22) + l / 2}%))`,
    ink: `hsl(${c.hue} ${c.sat < 20 ? c.sat + 40 : 90}% 80%)`,
  };
}

/** A get_folders row, read defensively. */
export function toFolder(r: {
  id: string;
  name: string;
  emoji: string | null;
  color: string | null;
  position: number;
  cover_url: string | null;
  item_count: number;
  covers: unknown;
}): Folder {
  const covers = Array.isArray(r.covers) ? (r.covers as Record<string, unknown>[]) : [];
  return {
    id: r.id,
    name: r.name,
    emoji: r.emoji,
    color: folderFill(r.color, r.id).key,
    position: r.position,
    coverUrl: r.cover_url,
    itemCount: Number(r.item_count) || 0,
    covers: covers.slice(0, 4).map((c) => ({
      kind: c.kind === "shot" ? "shot" : "post",
      thumb: typeof c.thumb === "string" && c.thumb ? c.thumb : null,
      video: typeof c.video === "string" && c.video ? c.video : null,
    })),
  };
}

/** Emoji offered when you make or edit a folder. */
export const FOLDER_EMOJI = ["✨", "🔥", "🎧", "📸", "🍜", "✈️", "👟", "💭", "🎬", "🏠", "💪", "🌙"];

/**
 * Make a folder at the end of yours. Its position is one past the last, so
 * it lands last even after you have arranged them (arranging numbers from 0).
 */
export async function makeFolder(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  draft: { name: string; emoji: string | null; color: string },
  after: Pick<Folder, "position">[]
): Promise<Folder | null> {
  const { data, error } = await supabase
    .from("collections")
    .insert({
      user_id: userId,
      name: draft.name,
      emoji: draft.emoji,
      color: draft.color,
      position: after.reduce((m, f) => Math.max(m, f.position), -1) + 1,
    })
    .select("id, name, emoji, color, position, cover_url")
    .single();
  if (error || !data) return null;
  return toFolder({ ...data, item_count: 0, covers: [] });
}

/** The trimmed name, or null if it will not do (1–40 characters). */
export function cleanFolderName(name: string): string | null {
  const n = name.trim().replace(/\s+/g, " ");
  return n.length >= 1 && n.length <= 40 ? n : null;
}
