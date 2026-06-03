import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReelsFeed } from "@/components/shots/ReelsFeed";

/**
 * Deep link to a single Shot (reel). Opens the vertical feed starting at
 * the target reel, then continues with the rest (newest first).
 */
export default async function ShotPage({
  params,
}: {
  params: Promise<{ shotId: string }>;
}) {
  const { shotId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const select =
    "id, user_id, media_url, caption, created_at, hype_count, comment_count, profiles(display_name, avatar_hue, username)";

  const { data: target } = await supabase.from("shots").select(select).eq("id", shotId).maybeSingle();
  if (!target) notFound();

  const { data: rest } = await supabase
    .from("shots")
    .select(select)
    .neq("id", shotId)
    .order("created_at", { ascending: false })
    .limit(49);

  const norm = (s: any) => ({
    ...s,
    profiles: Array.isArray(s.profiles) ? s.profiles[0] ?? null : s.profiles,
  });

  const reels = [norm(target), ...(rest ?? []).map(norm)];

  return <ReelsFeed reels={reels} currentUserId={user?.id ?? null} />;
}
