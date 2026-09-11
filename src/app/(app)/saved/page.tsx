import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SavedScreen } from "@/components/saved/SavedScreen";
import { SAVED_POST_COLS, SAVED_SHOT_COLS, savedPost, savedShot, type SavedItem } from "@/lib/saved";
import { toFolder } from "@/lib/folders";

/**
 * Everything you've saved, and the folders you keep it in.
 *
 * Saved used to be a tab inside your own profile that fetched 30 posts and 30
 * Shots with no pagination — save your 31st post and the oldest silently
 * became unreachable, in the one part of the app whose job is not losing
 * things. This is the first screenful; SavedScreen pages the rest.
 */
export const dynamic = "force-dynamic";

const PAGE = 60;

export default async function SavedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const [postsRes, shotsRes, foldersRes, postCount, shotCount] = await Promise.all([
    supabase.from("saved_posts").select(SAVED_POST_COLS).eq("user_id", user.id).order("created_at", { ascending: false }).limit(PAGE),
    supabase.from("saved_shots").select(SAVED_SHOT_COLS).eq("user_id", user.id).order("created_at", { ascending: false }).limit(PAGE),
    supabase.rpc("get_folders"),
    supabase.from("saved_posts").select("post_id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("saved_shots").select("shot_id", { count: "exact", head: true }).eq("user_id", user.id),
  ]);

  const rows = (d: unknown) => (d ?? []) as Record<string, unknown>[];
  const posts = rows(postsRes.data).flatMap((r) => savedPost(r) ?? []) as SavedItem[];
  const shots = rows(shotsRes.data).flatMap((r) => savedShot(r) ?? []) as SavedItem[];
  const total = postCount.count === null || shotCount.count === null ? null : postCount.count + shotCount.count;

  return (
    <SavedScreen
      userId={user.id}
      initialPosts={posts}
      initialShots={shots}
      initialFolders={(foldersRes.data ?? []).map(toFolder)}
      totalSaved={total}
      pageSize={PAGE}
    />
  );
}
