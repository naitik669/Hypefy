import { Video } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { ReelsFeed } from "@/components/shots/ReelsFeed";

export default async function ShotsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Shots = permanent video reels (newest first)
  const { data: shots } = await supabase
    .from("shots")
    .select("id, user_id, media_url, caption, created_at, hype_count, comment_count, profiles(display_name, avatar_hue, username)")
    .order("created_at", { ascending: false })
    .limit(50);

  const reels = (shots ?? []).map((s) => ({
    ...s,
    profiles: Array.isArray(s.profiles) ? s.profiles[0] ?? null : s.profiles,
  }));

  if (reels.length === 0) {
    return (
      <EmptyState
        icon={Video}
        title="No Shots yet"
        text="Shots are short video reels. Post the first one."
        ctaLabel="Add Shot"
        ctaHref="/create/shot"
      />
    );
  }

  return <ReelsFeed reels={reels} currentUserId={user?.id ?? null} />;
}
