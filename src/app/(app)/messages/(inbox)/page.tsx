import { ViewTransition } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MessagesHeader } from "@/components/messages/MessagesHeader";
import { MessagesInbox, type InboxRow } from "@/components/messages/MessagesInbox";
import { PullToRefresh } from "@/components/ui/PullToRefresh";
import { toDiaryEntries } from "@/lib/diary";
import { loadInboxRows } from "@/app/(app)/messages/load-rows";
import { toVaultOverview } from "@/lib/chat-vault";
import { SpotlightNudge } from "@/components/diary/SpotlightNudge";

/** When this inbox was drawn, so the page can tell a fresh one from one kept in memory. */
const renderStamp = () => Date.now();

export default async function MessagesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const [{ data: me }, { data: notes }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, username, avatar_hue, avatar_url")
      .eq("id", user.id)
      .maybeSingle(),
    // Today's pages, for the Spotlight card floating over the inbox — the
    // same rows Spotlight itself loads, so the card and the deck agree.
    supabase.rpc("get_notes"),
  ]);
  const pages = toDiaryEntries(notes as never);

  // Locked and hidden chats are left out here, on the server: they are not in
  // this page's payload at all, only counted (see load-rows.ts and 0115).
  const [rows, { data: overviewRows }] = await Promise.all([
    loadInboxRows(supabase, user.id, "normal"),
    supabase.rpc("vault_overview"),
  ]);
  const vault = toVaultOverview(overviewRows);

  return (
    // Holds still under a chat as it slides in over the inbox (globals.css),
    // instead of vanishing the moment the chat's route takes over.
    <ViewTransition exit="dm-under" default="none">
      <div>
      <MessagesHeader
        currentUserId={user.id}
        name={(me as any)?.display_name ?? (me as any)?.username ?? "You"}
        username={(me as any)?.username ?? null}
        avatarUrl={(me as any)?.avatar_url ?? null}
        hue={(me as any)?.avatar_hue ?? 280}
      />
      {/* Pulled down and held, Messages opens the Vault. Only for someone
          who has hidden a chat: for everyone else a pull is just a pull. */}
      <PullToRefresh holdTo={vault.hidden > 0 ? "/messages/vault" : undefined}>
        {/* Spotlight has no label anywhere: a small deck of cards in the
            corner, and nothing to say what it is. This says so, to people
            who are not using it, and less often each time they wave it off. */}
        <SpotlightNudge
          hasOwn={pages.some((p) => p.isSelf)}
          others={pages
            .filter((p) => !p.isSelf)
            .map((p) => ({ userId: p.userId, name: p.name, avatarUrl: p.avatarUrl, hue: p.hue }))}
        />
        <MessagesInbox rows={rows} currentUserId={user.id} pages={pages} renderedAt={renderStamp()} vault={vault} />
      </PullToRefresh>
      </div>
    </ViewTransition>
  );
}
