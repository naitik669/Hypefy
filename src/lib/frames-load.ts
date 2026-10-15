import { createClient } from "@/lib/supabase/server";
import { DECORATIONS } from "@/lib/cosmetics";
import { frameUrl, type FrameAsset, type FrameCatalog } from "@/lib/frames";

/**
 * Every frame anyone may be wearing, code-drawn and uploaded alike.
 *
 * Server-side, once per page, from the layout. Read with the caller's own
 * client because the catalogue is public — `products` grants SELECT to
 * anon, so a signed-out visitor looking at a shared profile sees frames
 * too.
 *
 * Retired items are left out, which is what makes retiring one take effect
 * everywhere at once: the id stops resolving and the frame stops drawing,
 * without touching a single profile row.
 */
export async function loadFrames(): Promise<FrameCatalog> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("id, name, tier, asset_path, scale, offset_x, offset_y")
    .eq("kind", "avatar_decoration")
    .eq("active", true)
    .order("sort", { ascending: true });

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const catalog: FrameCatalog = {};

  for (const row of data ?? []) {
    const r = row as {
      id: string;
      name: string | null;
      tier: string | null;
      asset_path: string | null;
      scale: number | string | null;
      offset_x: number | string | null;
      offset_y: number | string | null;
    };
    // The code-drawn ones have to stay in the catalogue, not just the
    // uploads: the tier check downstream reads from here, so a frame
    // missing from this map is a frame nobody can wear.
    const drawn = DECORATIONS.find((d) => d.id === r.id);
    if (!r.asset_path && !drawn) continue;
    catalog[r.id] = {
      id: r.id,
      label: r.name ?? drawn?.label ?? r.id,
      tier: (r.tier as FrameAsset["tier"]) ?? drawn?.tier ?? "premium",
      url: r.asset_path ? frameUrl(base, r.asset_path) : null,
      // numeric comes back as a string over the wire.
      scale: Number(r.scale ?? 1) || 1,
      offsetX: Number(r.offset_x ?? 0) || 0,
      offsetY: Number(r.offset_y ?? 0) || 0,
    };
  }
  return catalog;
}
