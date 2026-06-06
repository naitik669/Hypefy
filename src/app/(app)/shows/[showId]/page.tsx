import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ShowViewer } from "@/components/shows/ShowViewer";

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

  if (!target) notFound();

  // 2. Fetch all active Shows from the same user (for swipe navigation).
  //    Try the enhanced query (with linked_post join) first; fall back to
  //    the basic query if the linked_post_id column doesn't exist yet.
  let raw: any[] | null = null;

  const enhanced = await supabase
    .from("shows")
    .select(`
      id, user_id, media_url, caption, created_at, hype_count, linked_post_id, is_showcase,
      profiles(display_name, avatar_hue, username),
      linked_post:posts(
        id, caption, image_url, image_urls,
        profiles(display_name, username, avatar_hue, avatar_url)
      )
    `)
    .eq("user_id", target.user_id)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true });

  if (!enhanced.error) {
    raw = enhanced.data;
  } else {
    // linked_post_id column not yet migrated — fall back to basic query
    const basic = await supabase
      .from("shows")
      .select("id, user_id, media_url, caption, created_at, hype_count, profiles(display_name, avatar_hue, username)")
      .eq("user_id", target.user_id)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true });
    raw = basic.data;
  }

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

  if (shows.length === 0) notFound();

  const startIdx = Math.max(
    shows.findIndex((s) => s.id === showId),
    0,
  );

  return <ShowViewer shows={shows} startIdx={startIdx} currentUserId={user?.id ?? null} />;
}
