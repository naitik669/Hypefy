import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VaultHeader } from "@/components/vault/VaultHeader";
import { MessagesInbox } from "@/components/messages/MessagesInbox";
import { VaultGate } from "@/components/vault/VaultGate";
import { loadInboxRows } from "@/app/(app)/messages/load-rows";

/**
 * The Vault: hidden chats, which appear nowhere else.
 *
 * No screen links here. It is reached by pulling Messages down and holding,
 * or by typing the PIN into Messages search. Like the locked list, the
 * server draws only the door until the PIN has been entered (0115).
 */
export default async function VaultPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { data: open } = await supabase.rpc("vault_unlocked");
  if (!open) return <VaultGate title="Vault" />;

  // Anything not already hidden can be added from the three dots: chats
  // still in Messages, and chats that are locked but not hidden.
  const [rows, locked, normal] = await Promise.all([
    loadInboxRows(supabase, user.id, "hidden"),
    loadInboxRows(supabase, user.id, "locked"),
    loadInboxRows(supabase, user.id, "normal"),
  ]);

  return (
    <>
      <VaultHeader level="hidden" here={rows} outside={[...locked, ...normal.filter((r) => !r.isRequest)]} />
      <MessagesInbox rows={rows} currentUserId={user.id} level="hidden" />
    </>
  );
}
