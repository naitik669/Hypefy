import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { SavedView, type SavedItem, type SavedCollection } from "@/components/profile/SavedView";

/**
 * Everything you've saved, on a route.
 *
 * Saved was a tab inside your own profile that fetched 30 posts and 30 Shots
 * with no pagination and — unlike the Posts and Shots tabs beside it — no
 * scroll sentinel. Save your 31st post and the oldest silently became
 * unreachable, in the one part of the app whose entire job is not losing
 * things.
 *
 * Three empty states elsewhere already tell people to save things "you'll want
 * back"; this is the place those promises point to.
 */
export const dynamic = "force-dynamic";

const PAGE = 60;

export default async function SavedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const [postsRes, shotsRes, collectionsRes] = await Promise.all([
    supabase
      .from("saved_posts")
      .select("created_at, posts(id, image_url, image_urls, caption, aspect_ratio)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(PAGE),
    supabase
      .from("saved_shots")
      .select("created_at, shots(id, media_url, poster_url, caption)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(PAGE),
    supabase
      .from("collections")
      .select("id, name, cover_url, collection_items(count)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const one = <T,>(v: T | T[] | null): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : v;

  const posts: SavedItem[] = (postsRes.data ?? []).flatMap((r: Record<string, unknown>) => {
    const p = one(r.posts as Record<string, unknown> | Record<string, unknown>[] | null);
    if (!p) return [];
    return [
      {
        id: p.id as string,
        kind: "post" as const,
        thumb:
          ((p.image_urls as string[] | null)?.[0] ?? (p.image_url as string | null)) ?? null,
        caption: (p.caption as string) ?? null,
        savedAt: r.created_at as string,
      },
    ];
  });

  const shots: SavedItem[] = (shotsRes.data ?? []).flatMap((r: Record<string, unknown>) => {
    const s = one(r.shots as Record<string, unknown> | Record<string, unknown>[] | null);
    if (!s) return [];
    return [
      {
        id: s.id as string,
        kind: "shot" as const,
        thumb: ((s.poster_url as string) ?? (s.media_url as string)) ?? null,
        caption: (s.caption as string) ?? null,
        savedAt: r.created_at as string,
      },
    ];
  });

  const collections: SavedCollection[] = (collectionsRes.data ?? []).map(
    (c: Record<string, unknown>) => ({
      id: c.id as string,
      name: c.name as string,
      coverUrl: (c.cover_url as string) ?? null,
      count: Array.isArray(c.collection_items)
        ? ((c.collection_items[0] as { count?: number })?.count ?? 0)
        : 0,
    })
  );

  return (
    <>
      <PageHeader title="Saved" showBack />
      <SavedView
        userId={user.id}
        initialPosts={posts}
        initialShots={shots}
        collections={collections}
        pageSize={PAGE}
      />
    </>
  );
}
