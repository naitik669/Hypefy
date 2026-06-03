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

  // 2. Fetch all active Shows from the same user (for swipe navigation)
  const { data: raw } = await supabase
    .from("shows")
    .select("id, user_id, media_url, caption, created_at, hype_count, profiles(display_name, avatar_hue, username)")
    .eq("user_id", target.user_id)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true });

  const shows = (raw ?? []).map((s) => ({
    ...s,
    profiles: Array.isArray(s.profiles) ? s.profiles[0] ?? null : s.profiles,
  }));

  if (shows.length === 0) notFound();

  const startIdx = Math.max(
    shows.findIndex((s) => s.id === showId),
    0,
  );

  return <ShowViewer shows={shows} startIdx={startIdx} currentUserId={user?.id ?? null} />;
}
