import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DiaryHome } from "@/components/diary/DiaryHome";
import { HYPES_SELECT, REACTIONS_SELECT, toDiaryEntries, toHypes, toReactions } from "@/lib/diary";

export const metadata = { title: "Spotlight" };

/**
 * Spotlight — the screen of pages: 24-hour notes from your circle, opened
 * from Messages.
 *
 * Everything the page shows is fetched here, on the server, so it arrives
 * complete rather than filling in after it opens: every page you may see,
 * the reactions and hypes on yours, and your own reaction and hype already
 * marked on each of theirs.
 *
 * Under /messages so the Messages tab stays lit while you are here — the
 * bottom nav matches on the /messages prefix.
 */
export default async function SpotlightPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const [{ data: notes }, { data: me }, { data: mineReacted }, { data: mineHyped }] = await Promise.all([
    // Yours first, then mutual follows you may see — audience, blocks and
    // expiry all decided inside the RPC, so nothing here can widen it.
    supabase.rpc("get_notes"),
    supabase.from("profiles").select("display_name, username, avatar_hue, avatar_url").eq("id", user.id).maybeSingle(),
    // The reactions and hypes YOU have given, so each card shows them
    // already. RLS lets you read your own rows.
    supabase.from("note_reactions").select("note_owner_id, emoji, note_created_at").eq("reactor_id", user.id),
    supabase.from("note_hypes").select("note_owner_id, note_created_at").eq("hyper_id", user.id),
  ]);

  const entries = toDiaryEntries(notes as never);
  const mine = entries.find((e) => e.isSelf) ?? null;
  const current = (owner: string, writtenAt: string) =>
    entries.find((e) => e.userId === owner)?.createdAt === writtenAt;

  // Reactions and hypes on your current page — matched to it by when it was
  // written, so one left on yesterday's does not appear under today's.
  const [{ data: onMine }, { data: hypesOnMine }] = mine
    ? await Promise.all([
        supabase
          .from("note_reactions")
          .select(REACTIONS_SELECT)
          .eq("note_owner_id", user.id)
          .eq("note_created_at", mine.createdAt),
        supabase
          .from("note_hypes")
          .select(HYPES_SELECT)
          .eq("note_owner_id", user.id)
          .eq("note_created_at", mine.createdAt),
      ])
    : [{ data: null }, { data: null }];

  // Yours, per friend — but only if it was on the page they have now.
  const myReactions: Record<string, string> = {};
  for (const r of (mineReacted ?? []) as { note_owner_id: string; emoji: string; note_created_at: string }[]) {
    if (current(r.note_owner_id, r.note_created_at)) myReactions[r.note_owner_id] = r.emoji;
  }
  const myHypes = ((mineHyped ?? []) as { note_owner_id: string; note_created_at: string }[])
    .filter((h) => current(h.note_owner_id, h.note_created_at))
    .map((h) => h.note_owner_id);

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
      hypesOnMine={toHypes(hypesOnMine as never)}
      myReactions={myReactions}
      myHypes={myHypes}
    />
  );
}
