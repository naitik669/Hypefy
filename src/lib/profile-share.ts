import { createClient } from "@/lib/supabase/server";

/** What a shared profile link shows in WhatsApp, iMessage, X and the rest. */
export type ShareProfile = {
  name: string;
  username: string;
  bio: string | null;
  hue: number;
  verified: boolean;
  followers: number;
  /** Null for a private account: its posts are not visible to a stranger. */
  posts: number | null;
  /** The avatar as a data URL, or null to draw the initial instead. */
  photo: string | null;
};

/** Formats the preview renderer can draw. WebP and AVIF it cannot. */
const DRAWABLE = ["image/jpeg", "image/png"];
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

/**
 * The avatar, fetched here rather than handed to the renderer as a URL, so a
 * missing, oversized or undrawable image falls back to the initial instead of
 * failing the whole preview.
 */
async function photoData(url: string | null): Promise<string | null> {
  if (!url || !url.startsWith("https://")) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    const type = res.headers.get("content-type")?.split(";")[0] ?? "";
    if (!res.ok || !DRAWABLE.includes(type)) return null;
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength > MAX_PHOTO_BYTES) return null;
    return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch {
    return null;
  }
}

async function count(query: PromiseLike<{ count: number | null }>): Promise<number> {
  const { count: n } = await query;
  return n ?? 0;
}

/** The profile behind /u/[username], as a link preview shows it, or null if there is none. */
export async function shareProfile(username: string): Promise<ShareProfile | null> {
  const supabase = await createClient();
  const { data: p } = await supabase
    .from("profiles")
    .select("id, display_name, username, bio, avatar_url, avatar_hue, is_verified, is_private")
    .eq("username", username.toLowerCase())
    .eq("profile_completed", true)
    .maybeSingle();
  if (!p?.username) return null;

  const head = { count: "exact" as const, head: true };
  const [followers, posts, shots, photo] = await Promise.all([
    count(supabase.from("follows").select("id", head).eq("following_id", p.id)),
    p.is_private ? null : count(supabase.from("posts").select("id", head).eq("user_id", p.id)),
    p.is_private ? null : count(supabase.from("shots").select("id", head).eq("user_id", p.id)),
    photoData(p.avatar_url),
  ]);

  return {
    name: p.display_name || p.username,
    username: p.username,
    bio: p.bio?.trim() || null,
    hue: p.avatar_hue ?? 280,
    verified: !!p.is_verified,
    followers,
    // "Posts" includes Shots, as on the profile.
    posts: posts === null || shots === null ? null : posts + shots,
    photo,
  };
}
