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

  // 2. Fetch all active Shows from the same user.
  //    Build the select string based on which optional columns exist — we probe
  //    them independently so a single missing column doesn't break the whole page.
  const nowIso = new Date().toISOString();
  // profiles must be disambiguated: show_views adds a second shows<->profiles
  // relationship path, which makes a bare profiles(...) embed error (PGRST201).
  const baseSelect = `id, user_id, media_url, caption, created_at, hype_count, profiles!shows_user_id_fkey(display_name, avatar_hue, username)`;

  // Probe for linked_post_id + is_showcase in one call; degrade gracefully.
  const [probeLinked, probeShowcase] = await Promise.all([
    supabase.from("shows").select("linked_post_id").eq("id", target.id).maybeSingle(),
    supabase.from("shows").select("is_showcase").eq("id", target.id).maybeSingle(),
  ]);
  const hasLinkedPost  = !probeLinked.error;
  const hasIsShowcase  = !probeShowcase.error;

  const extraCols = [
    hasIsShowcase  ? "is_showcase"   : "",
    hasLinkedPost  ? "linked_post_id, linked_post:posts(id, caption, image_url, image_urls, profiles(display_name, username, avatar_hue, avatar_url))" : "",
  ].filter(Boolean).join(", ");

  const selectStr = extraCols ? `${baseSelect}, ${extraCols}` : baseSelect;

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

  if (shows.length === 0) notFound();

  const startIdx = Math.max(
    shows.findIndex((s) => s.id === showId),
    0,
  );

  return <ShowViewer shows={shows} startIdx={startIdx} currentUserId={user?.id ?? null} />;
}
