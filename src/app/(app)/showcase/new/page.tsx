import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { ShowcaseEditor } from "@/components/showcase/ShowcaseEditor";

export default async function NewShowcasePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  // Everything of yours that can go in a board, fetched once. A profile has
  // tens of these, not thousands, so paging would be machinery for a list
  // that fits on one screen.
  const [shows, shots] = await Promise.all([
    supabase
      .from("shows")
      .select("id, media_url, caption, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("shots")
      .select("id, media_url, poster_url, caption, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(60),
  ]);

  return (
    <>
      <PageHeader title="New Showcase" showBack />
      <ShowcaseEditor
        userId={user.id}
        shows={(shows.data ?? []) as never[]}
        shots={(shots.data ?? []) as never[]}
      />
    </>
  );
}
