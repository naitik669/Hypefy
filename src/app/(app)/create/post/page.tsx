import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

import { PostComposer } from "@/components/post/PostComposer";

export default async function CreatePostPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  // The composer previews the post as it will appear in the feed, so it needs
  // the same author chip the feed draws.
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, username, avatar_hue, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  // The header is rendered by the composer, not here: its back arrow has to
  // retreat from Preview to Compose before it leaves the screen, which means
  // it needs the step state.
  return (
    <>
      <PostComposer
        userId={user.id}
        author={{
          name: profile?.display_name ?? profile?.username ?? "You",
          username: profile?.username ?? null,
          hue: profile?.avatar_hue ?? 280,
          avatarUrl: profile?.avatar_url ?? null,
        }}
      />
    </>
  );
}
