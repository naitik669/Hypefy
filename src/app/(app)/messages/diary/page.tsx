import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { DiaryGrid } from "@/components/diary/DiaryGrid";
import { toDiaryEntries } from "@/lib/diary";

export const metadata = { title: "Diary" };

/**
 * Diary — 24-hour notes from your circle, opened from Messages.
 *
 * Under /messages rather than at its own root because that is where it is
 * reached from, and so the Messages tab stays lit while you are here — the
 * bottom nav matches on the /messages prefix.
 */
export default async function DiaryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const [{ data: notes }, { data: me }] = await Promise.all([
    // Yours first, then mutual follows you may see — audience, blocks and
    // expiry all decided inside the RPC, so nothing here can widen it.
    supabase.rpc("get_notes"),
    supabase
      .from("profiles")
      .select("display_name, username, avatar_hue, avatar_url")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  return (
    <>
      <PageHeader title="Diary" showBack />
      <DiaryGrid
        entries={toDiaryEntries(notes as never)}
        currentUserId={user.id}
        me={{
          name: me?.display_name ?? me?.username ?? "You",
          hue: me?.avatar_hue ?? 280,
          avatarUrl: me?.avatar_url ?? null,
        }}
      />
    </>
  );
}
