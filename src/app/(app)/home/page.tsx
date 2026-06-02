import { redirect } from "next/navigation";
import { PlusCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { ShowsRow } from "@/components/home/ShowsRow";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * Home feed — shows real posts from Supabase.
 * The `posts` table does not exist yet, so we show an empty state
 * rather than fake users. When posts are connected, replace the
 * empty-state branch with real PostCard rows.
 */
export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/signin");

  // TODO: fetch real posts from `posts` table when it exists.
  // const { data: posts } = await supabase
  //   .from("posts")
  //   .select("*, profiles(*)")
  //   .order("created_at", { ascending: false })
  //   .limit(20);
  const posts: unknown[] = []; // empty until posts table is live

  // Shows: no Shows table yet — row renders with "Your Show +" only
  const shows: unknown[] = [];

  return (
    <>
      <TopBar />
      <ShowsRow shows={shows as never[]} />

      {posts.length === 0 ? (
        <EmptyState
          icon={PlusCircle}
          title="No posts yet"
          text="Follow people, join rooms, or create the first post."
          ctaLabel="Create Post"
          ctaHref="/create"
        />
      ) : (
        <div className="flex flex-col">
          {/* Real PostCards go here once posts table is live */}
        </div>
      )}
    </>
  );
}
