import { Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { RealShotsViewer } from "@/components/shots/RealShotsViewer";

export default async function ShotsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: shots } = await supabase
    .from("shots")
    .select("id, user_id, media_url, caption, created_at, expires_at, in_showcase, hype_count, profiles(display_name, avatar_hue, username)")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(50);

  const normalized = (shots ?? []).map((s) => ({
    ...s,
    in_showcase: s.in_showcase as boolean,
    profiles: Array.isArray(s.profiles) ? s.profiles[0] ?? null : s.profiles,
  }));

  if (normalized.length === 0) {
    return (
      <EmptyState
        icon={Zap}
        title="No Shots yet"
        text="Be the first to share a 24-hour moment."
        ctaLabel="Add Shot"
        ctaHref="/create/shot"
      />
    );
  }

  return (
    <RealShotsViewer
      shots={normalized}
      startIdx={0}
      currentUserId={user?.id ?? null}
    />
  );
}
