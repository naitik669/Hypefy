import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { ScheduledList, type ScheduledPost } from "@/components/post/ScheduledList";

export default async function ScheduledPostsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { data } = await supabase
    .from("scheduled_posts")
    .select("id, caption, body, image_urls, scheduled_at")
    .eq("user_id", user.id)
    .order("scheduled_at", { ascending: true });

  const posts: ScheduledPost[] = (data ?? []).map((p: any) => ({
    id: p.id,
    caption: p.caption,
    body: p.body,
    image: (p.image_urls ?? [])[0] ?? null,
    scheduledAt: p.scheduled_at,
  }));

  return (
    <>
      <PageHeader title="Scheduled posts" showBack />
      <ScheduledList posts={posts} />
    </>
  );
}
