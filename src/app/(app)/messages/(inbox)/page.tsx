import { ViewTransition } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MessagesHeader } from "@/components/messages/MessagesHeader";
import { MessagesInbox, type InboxRow } from "@/components/messages/MessagesInbox";
import { PullToRefresh } from "@/components/ui/PullToRefresh";
import { toDiaryEntries } from "@/lib/diary";
import { loadInboxRows } from "@/app/(app)/messages/load-rows";
import { toVaultOverview } from "@/lib/chat-vault";
import { SpotlightPointer } from "@/components/diary/SpotlightPointer";

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

  // Named once, typed once. Both the header and the pages strip want the
  // same four fields, and each reading them straight off the row meant a
  // cast per field at each call site.
  const profile = me as {
    display_name: string | null;
    username: string | null;
    avatar_hue: number | null;
    avatar_url: string | null;
  } | null;
  const mine = {
    name: profile?.display_name ?? profile?.username ?? "You",
    hue: profile?.avatar_hue ?? 280,
    avatarUrl: profile?.avatar_url ?? null,
  };

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
        name={mine.name}
        username={profile?.username ?? null}
        avatarUrl={mine.avatarUrl}
        hue={mine.hue}
      />
      {/* Pulled down and held, Messages opens the Vault. Only for someone
          who has hidden a chat: for everyone else a pull is just a pull. */}
      <PullToRefresh holdTo={vault.hidden > 0 ? "/messages/vault" : undefined}>
        {/* Spotlight has no label anywhere: a small deck of cards in the
            corner, and nothing to say what it is. A note points at it for
            people who have not posted there lately, a few times at most. */}
        <SpotlightPointer ownPageAt={pages.find((p) => p.isSelf)?.createdAt ?? null} />
        <MessagesInbox
          rows={rows}
          currentUserId={user.id}
          pages={pages}
          me={mine}
          renderedAt={renderStamp()}
          vault={vault}
        />
      </PullToRefresh>
      </div>
    </ViewTransition>
  );
}
