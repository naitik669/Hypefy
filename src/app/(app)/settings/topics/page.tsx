import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { HashtagManager } from "@/components/settings/HashtagManager";

export default async function TopicsSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { data } = await supabase
    .from("hashtag_follows")
    .select("tag")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const tags = ((data ?? []) as { tag: string }[]).map((r) => r.tag);

  return (
    <>
      <PageHeader title="Topics you follow" showBack />
      <HashtagManager tags={tags} />
    </>
  );
}
