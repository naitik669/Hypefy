"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function MessageButton({
  currentUserId,
  targetUserId,
}: {
  currentUserId: string | null;
  targetUserId: string;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startChat() {
    if (pending) return;
    if (!currentUserId) { router.push("/signin"); return; }
    if (currentUserId === targetUserId) return;

    setPending(true);
    setError(null);
    const { data: convId, error: err } = await supabase.rpc("get_or_create_dm", { p_other: targetUserId });
    if (err || !convId) {
      setError(
        err?.message?.includes("dm_restricted")
          ? "DMs limited to people they follow"
          : err?.message?.includes("blocked")
            ? "Can't message this account"
            : "Couldn't start chat",
      );
      setPending(false);
      setTimeout(() => setError(null), 2200);
      return;
    }
    router.push(`/messages/${convId}`);
  }

  return (
    <button
      type="button"
      onClick={startChat}
      disabled={pending}
      className="flex h-10 flex-1 items-center justify-center rounded-xl border border-border bg-surface text-sm font-semibold text-foreground transition-colors hover:bg-elevated disabled:opacity-60"
    >
      {pending ? <Loader2 size={16} className="animate-spin" /> : error ?? "Message"}
    </button>
  );
}
