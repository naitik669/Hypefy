import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { ScheduledList, type ScheduledPost } from "@/components/post/ScheduledList";

export default async function ScheduledPostsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  // Both kinds, merged by when they go up. A Shot you had scheduled and
  // could not see here would be one you could not cancel either.
  const [{ data: postRows }, { data: shotRows }] = await Promise.all([
    supabase
      .from("scheduled_posts")
      .select("id, caption, body, image_urls, scheduled_at")
      .eq("user_id", user.id)
      .order("scheduled_at", { ascending: true }),
    supabase
      .from("scheduled_shots")
      .select("id, caption, poster_url, scheduled_at")
      .eq("user_id", user.id)
      .order("scheduled_at", { ascending: true }),
  ]);

  const posts: ScheduledPost[] = [
    ...(postRows ?? []).map((p) => ({
      id: p.id,
      caption: p.caption,
      body: p.body,
      image: (p.image_urls ?? [])[0] ?? null,
      scheduledAt: p.scheduled_at,
      kind: "post" as const,
    })),
    ...(shotRows ?? []).map((s) => ({
      id: s.id,
      caption: s.caption,
      body: null,
      image: s.poster_url,
      scheduledAt: s.scheduled_at,
      kind: "shot" as const,
    })),
  ].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  return (
    <>
      <PageHeader title="Scheduled" showBack />
      <ScheduledList posts={posts} />
    </>
  );
}
