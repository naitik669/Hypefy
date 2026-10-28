"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type Waiting = {
  userId: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  hue: number;
};

export type GroupInvite = {
  code: string;
  requiresApproval: boolean;
};

/** The address a code is handed out as. */
export function inviteUrl(code: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/join/${code}`;
}

/**
 * A group's invite link, and whoever is waiting on it.
 *
 * Both are admin business, but the link itself is readable by any member —
 * the policy on conversation_invites says so — and this does not try to
 * decide that for itself. What it does not do is guess: every write goes
 * through a function that checks admin on the server, and a refusal comes
 * back as false rather than as a thrown error, because the caller is a
 * button that needs to say something.
 */
export function useGroupInvite(conversationId: string, isGroup: boolean) {
  const [supabase] = useState(createClient);
  const [invite, setInvite] = useState<GroupInvite | null>(null);
  const [waiting, setWaiting] = useState<Waiting[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!isGroup) {
      setLoading(false);
      return;
    }
    const [{ data: inv }, { data: reqs }] = await Promise.all([
      supabase
        .from("conversation_invites")
        .select("code, requires_approval")
        .eq("conversation_id", conversationId)
        .maybeSingle(),
      supabase
        .from("conversation_join_requests")
        .select("user_id, profiles!conversation_join_requests_user_id_fkey(display_name, username, avatar_url, avatar_hue)")
        .eq("conversation_id", conversationId),
    ]);

    setInvite(inv ? { code: inv.code, requiresApproval: inv.requires_approval } : null);
    setWaiting(
      ((reqs ?? []) as unknown as {
        user_id: string;
        profiles: {
          display_name: string | null;
          username: string | null;
          avatar_url: string | null;
          avatar_hue: number | null;
        } | null;
      }[]).map((r) => ({
        userId: r.user_id,
        name: r.profiles?.display_name?.trim() || r.profiles?.username || "Someone",
        username: r.profiles?.username ?? null,
        avatarUrl: r.profiles?.avatar_url ?? null,
        hue: r.profiles?.avatar_hue ?? 200,
      })),
    );
    setLoading(false);
  }, [supabase, conversationId, isGroup]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch
    void load();
  }, [load]);

  /** Make one, or make a new one — which is how an old link is revoked. */
  const regenerate = useCallback(
    async (requiresApproval: boolean): Promise<boolean> => {
      const { data, error } = await supabase.rpc("set_group_invite", {
        p_conversation_id: conversationId,
        p_requires_approval: requiresApproval,
      });
      if (error || typeof data !== "string") return false;
      setInvite({ code: data, requiresApproval });
      return true;
    },
    [supabase, conversationId],
  );

  /** Change the switch without changing the link people already hold. */
  const setApproval = useCallback(
    async (requiresApproval: boolean): Promise<boolean> => {
      const before = invite;
      setInvite((prev) => (prev ? { ...prev, requiresApproval } : prev));
      const { error } = await supabase.rpc("set_group_invite_approval", {
        p_conversation_id: conversationId,
        p_requires_approval: requiresApproval,
      });
      if (!error) return true;
      setInvite(before);
      return false;
    },
    [supabase, conversationId, invite],
  );

  const revoke = useCallback(async (): Promise<boolean> => {
    const before = invite;
    setInvite(null);
    const { error } = await supabase.rpc("clear_group_invite", {
      p_conversation_id: conversationId,
    });
    if (!error) return true;
    setInvite(before);
    return false;
  }, [supabase, conversationId, invite]);

  /** Let somebody in, or turn them away. Either way they stop waiting. */
  const decide = useCallback(
    async (userId: string, accept: boolean): Promise<boolean> => {
      const before = waiting;
      setWaiting((prev) => prev.filter((w) => w.userId !== userId));
      const { error } = await supabase.rpc("decide_join_request", {
        p_conversation_id: conversationId,
        p_user_id: userId,
        p_accept: accept,
      });
      if (!error) return true;
      setWaiting(before);
      return false;
    },
    [supabase, conversationId, waiting],
  );

  return { invite, waiting, loading, regenerate, setApproval, revoke, decide };
}
