import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ShotComposer } from "@/components/post/ShotComposer";

export default async function CreateShotPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  // The composer previews the Shot as the reel feed will draw it, so it needs
  // the same author chip that goes over the video.
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, username, avatar_hue, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  // The header is rendered by the composer, not here: its back arrow has to
  // retreat from Preview to Compose before it leaves the screen, which means
  // it needs the step state.
  return (
    <ShotComposer
      userId={user.id}
      author={{
        name: profile?.display_name ?? profile?.username ?? "You",
        username: profile?.username ?? null,
        hue: profile?.avatar_hue ?? 280,
        avatarUrl: profile?.avatar_url ?? null,
      }}
    />
  );
}
