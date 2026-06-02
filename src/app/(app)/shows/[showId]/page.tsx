import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RealShotsViewer } from "@/components/shots/RealShotsViewer";

export default async function ShowPage({
  params,
}: {
  params: Promise<{ showId: string }>;
}) {
  const { showId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // 1. Get the target shot to know whose shows to fetch
  const { data: target } = await supabase
    .from("shots")
    .select("id, user_id")
    .eq("id", showId)
    .maybeSingle();

  if (!target) notFound();

  // 2. Fetch all active shots from same user (for swipe navigation)
  const { data: raw } = await supabase
    .from("shots")
    .select("id, user_id, media_url, caption, created_at, expires_at, in_showcase, profiles(display_name, avatar_hue, username)")
    .eq("user_id", target.user_id)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true });

  const shots = (raw ?? []).map((s) => ({
    ...s,
    in_showcase: s.in_showcase as boolean,
    profiles: Array.isArray(s.profiles) ? s.profiles[0] ?? null : s.profiles,
  }));

  if (shots.length === 0) notFound();

  const startIdx = Math.max(shots.findIndex((s) => s.id === showId), 0);

  return (
    <RealShotsViewer
      shots={shots}
      startIdx={startIdx}
      currentUserId={user?.id ?? null}
    />
  );
}
