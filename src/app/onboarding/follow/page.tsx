import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FollowSuggestions } from "@/components/onboarding/FollowSuggestions";
import { ToastProvider } from "@/components/ui/ToastProvider";

/** Post-signup step: suggest people to follow so the feed isn't cold. */
export default async function OnboardingFollowPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  // Friendly-circle suggestions first (shared interests from onboarding tags, etc.).
  const { data: suggested } = await supabase.rpc("get_suggested_people", {
    p_limit: 20,
  });
  let people = (suggested ?? []) as any[];

  // Cold start (no interests/graph yet): fall back to recent completed profiles.
  if (people.length === 0) {
    const { data: followRows } = await supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", user.id);
    const followingIds = (followRows ?? []).map(
      (r: any) => r.following_id as string
    );
    let query = supabase
      .from("profiles")
      .select(
        "id, display_name, username, avatar_hue, avatar_url, bio, profile_tags"
      )
      .eq("profile_completed", true)
      .neq("id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (followingIds.length > 0) {
      query = query.not(
        "id",
        "in",
        `(${followingIds.join(",")})`
      ) as typeof query;
    }
    people = ((await query).data ?? []) as any[];
  }

  // Nobody to suggest — skip straight to the feed
  if (people.length === 0) redirect("/home");

  // This route sits outside the (app) group, so it inherits the root layout
  // and has no ToastProvider of its own. Without one, useToast resolves to
  // the context default — a no-op — and every failure here stays silent.
  return (
    <ToastProvider>
      <FollowSuggestions currentUserId={user.id} people={people} />
    </ToastProvider>
  );
}
