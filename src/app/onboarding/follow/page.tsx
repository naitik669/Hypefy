import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FollowSuggestions } from "@/components/onboarding/FollowSuggestions";

/** Post-signup step: pick creators to follow so the feed isn't cold. */
export default async function OnboardingFollowPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  // Exclude self + anyone already followed (e.g. user navigated back here)
  const { data: followRows } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", user.id);
  const followingIds = (followRows ?? []).map((r: any) => r.following_id as string);

  let query = supabase
    .from("profiles")
    .select("id, display_name, username, avatar_hue, avatar_url, bio, profile_tags")
    .eq("profile_completed", true)
    .neq("id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (followingIds.length > 0) {
    query = query.not("id", "in", `(${followingIds.join(",")})`) as typeof query;
  }
  const { data: people } = await query;

  // Nobody to suggest — skip straight to the feed
  if (!people || people.length === 0) redirect("/home");

  return <FollowSuggestions currentUserId={user.id} people={people as any[]} />;
}
