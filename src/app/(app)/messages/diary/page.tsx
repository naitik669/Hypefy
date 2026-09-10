import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DiaryHome } from "@/components/diary/DiaryHome";
import { REACTIONS_SELECT, toDiaryEntries, toReactions } from "@/lib/diary";

export const metadata = { title: "Diary" };

/**
 * Diary — 24-hour notes from your circle, opened from Messages.
 *
 * One tap from Messages, and then nothing else to tap to see what is here:
 * every note in full, the reactions on yours, and your own reaction already
 * marked on each of theirs. All of that is fetched here, on the server, so
 * the page arrives complete rather than filling in after it opens.
 *
 * Under /messages so the Messages tab stays lit while you are here — the
 * bottom nav matches on the /messages prefix.
 */
export default async function DiaryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const [{ data: notes }, { data: me }, { data: mineReacted }, { count: archiveCount }] =
    await Promise.all([
      // Yours first, then mutual follows you may see — audience, blocks and
      // expiry all decided inside the RPC, so nothing here can widen it.
      supabase.rpc("get_notes"),
      supabase
        .from("profiles")
        .select("display_name, username, avatar_hue, avatar_url")
        .eq("id", user.id)
        .maybeSingle(),
      // The reactions YOU have left, so each card can show your emoji
      // already picked. RLS lets a reactor read their own rows.
      supabase
        .from("note_reactions")
        .select("note_owner_id, emoji, note_created_at")
        .eq("reactor_id", user.id),
      // How many past Diaries you have, for the archive row.
      supabase.from("diary_archive").select("id", { count: "exact", head: true }),
    ]);

  const entries = toDiaryEntries(notes as never);
  const mine = entries.find((e) => e.isSelf) ?? null;

  // Reactions on your current Diary — matched to it by when it was written,
  // so a reaction left on yesterday's does not appear under today's.
  const { data: onMine } = mine
    ? await supabase
        .from("note_reactions")
        .select(REACTIONS_SELECT)
        .eq("note_owner_id", user.id)
        .eq("note_created_at", mine.createdAt)
    : { data: null };

  // Your reaction per friend, but only if it was on the Diary they have now.
  const myReactions: Record<string, string> = {};
  for (const r of (mineReacted ?? []) as { note_owner_id: string; emoji: string; note_created_at: string }[]) {
    const theirs = entries.find((e) => e.userId === r.note_owner_id);
    if (theirs && theirs.createdAt === r.note_created_at) myReactions[r.note_owner_id] = r.emoji;
  }

  return (
    <DiaryHome
      entries={entries}
      currentUserId={user.id}
      me={{
        name: me?.display_name ?? me?.username ?? "You",
        hue: me?.avatar_hue ?? 280,
        avatarUrl: me?.avatar_url ?? null,
      }}
      reactionsOnMine={toReactions(onMine as never)}
      myReactions={myReactions}
      archiveCount={archiveCount ?? 0}
    />
  );
}
