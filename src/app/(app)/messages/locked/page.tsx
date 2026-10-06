import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VaultHeader } from "@/components/vault/VaultHeader";
import { MessagesInbox } from "@/components/messages/MessagesInbox";
import { VaultGate } from "@/components/vault/VaultGate";
import { loadInboxRows } from "@/app/(app)/messages/load-rows";
import { toVaultOverview } from "@/lib/chat-vault";

/**
 * Locked chats: the ones taken out of Messages and put behind the PIN.
 *
 * Whether to draw the list is asked of the database, here on the server
 * (0115). Until the PIN has been entered this page sends the door and
 * nothing else: no names, no faces, no count of what is behind it.
 */
export default async function LockedChatsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { data: open } = await supabase.rpc("vault_unlocked");
  if (!open) return <VaultGate title="Locked chats" />;

  // The ordinary inbox is loaded too, for "Add chats" behind the three
  // dots: those are the chats that could be locked next.
  const [rows, outside, { data: overviewRows }] = await Promise.all([
    loadInboxRows(supabase, user.id, "locked"),
    loadInboxRows(supabase, user.id, "normal"),
    supabase.rpc("vault_overview"),
  ]);

  return (
    <>
      <VaultHeader level="locked" here={rows} outside={outside.filter((r) => !r.isRequest)} />
      <MessagesInbox rows={rows} currentUserId={user.id} level="locked" vault={toVaultOverview(overviewRows)} />
    </>
  );
}
