import { createClient } from "@/lib/supabase/server";
import { ShowViewer } from "@/components/shows/ShowViewer";
import { GoneScreen } from "@/components/empty/GoneScreen";

export default async function ShowPage({
  params,
}: {
  params: Promise<{ showId: string }>;
}) {
  const { showId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 1. Get the target Show to know which reel to fetch
  const { data: target } = await supabase
    .from("shows")
    .select("id, user_id, collab_id")
    .eq("id", showId)
    .maybeSingle();

  if (!target) return <GoneScreen kind="show" />;

  // 2. Fetch all active Shows from the same user.
  const nowIso = new Date().toISOString();
  // profiles must be disambiguated: show_views adds a second shows<->profiles
  // relationship path, which makes a bare profiles(...) embed error (PGRST201).
  const baseSelect = `id, user_id, media_url, caption, created_at, hype_count, track, layers, profiles!shows_user_id_fkey(display_name, avatar_hue, username)`;

  // Whether each one is kept comes from the boards rather than the old
  // is_showcase flag, which 0185 stopped reading: a flagged Show
  // survived its day but sat on no board, so "kept" meant two things.
  // Embedded rather than fetched separately, which is what the flag was
  // bought here for — two extra round trips on every Show opened.
  const extraCols =
    "linked_post_id, showcase_items(id, removed_at), linked_post:posts(id, caption, image_url, image_urls, profiles!posts_user_id_fkey(display_name, username, avatar_hue, avatar_url))";

  const selectStr = `${baseSelect}, ${extraCols}`;

  /**
   * The reel this Show belongs to.
   *
   * A Show posted into a shared Show plays with the rest of that
   * collab, not with the rest of its author's own Shows. The ring
   * draws it as one cover standing for several people; opening it and
   * getting one person's reel instead would make the cover a lie.
   */
  const reel = supabase
    .from("shows")
    .select(selectStr)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: true });

  const { data: raw } = await (target.collab_id
    ? reel.eq("collab_id", target.collab_id)
    : reel.eq("user_id", target.user_id).is("collab_id", null));

  const shows = (raw ?? []).map((s: any) => ({
    ...s,
    kept: ((s.showcase_items ?? []) as { removed_at: string | null }[]).some(
      (i) => i.removed_at == null,
    ),
    profiles: Array.isArray(s.profiles) ? s.profiles[0] ?? null : s.profiles,
    linked_post: s.linked_post
      ? {
          ...(Array.isArray(s.linked_post) ? s.linked_post[0] : s.linked_post),
          profiles: (() => {
            const lp = Array.isArray(s.linked_post) ? s.linked_post[0] : s.linked_post;
            return Array.isArray(lp?.profiles) ? lp.profiles[0] ?? null : lp?.profiles ?? null;
          })(),
        }
      : null,
  }));

  // Found, but expired: the same "off air" screen rather than a bare 404.
  if (shows.length === 0) return <GoneScreen kind="show" />;

  const startIdx = Math.max(
    shows.findIndex((s) => s.id === showId),
    0,
  );

  return <ShowViewer shows={shows} startIdx={startIdx} currentUserId={user?.id ?? null} />;
}
