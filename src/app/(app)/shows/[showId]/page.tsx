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

  // 1. Get the target Show to know whose Shows to fetch
  const { data: target } = await supabase
    .from("shows")
    .select("id, user_id")
    .eq("id", showId)
    .maybeSingle();

  if (!target) return <GoneScreen kind="show" />;

  // 2. Fetch all active Shows from the same user.
  const nowIso = new Date().toISOString();
  // profiles must be disambiguated: show_views adds a second shows<->profiles
  // relationship path, which makes a bare profiles(...) embed error (PGRST201).
  const baseSelect = `id, user_id, media_url, caption, created_at, hype_count, track, profiles!shows_user_id_fkey(display_name, avatar_hue, username)`;

  // is_showcase and linked_post_id have long existed; probing for them cost
  // two extra round trips on every Show opened.
  const extraCols =
    "is_showcase, linked_post_id, linked_post:posts(id, caption, image_url, image_urls, profiles!posts_user_id_fkey(display_name, username, avatar_hue, avatar_url))";

  const selectStr = `${baseSelect}, ${extraCols}`;

  const { data: raw } = await supabase
    .from("shows")
    .select(selectStr)
    .eq("user_id", target.user_id)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: true });

  const shows = (raw ?? []).map((s: any) => ({
    ...s,
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
