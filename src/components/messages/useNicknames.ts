"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Nicknames } from "@/lib/nicknames";

/**
 * What you call the people in one chat.
 *
 * One query per conversation rather than one per member — a group of
 * twenty is one round trip. Nobody else's rows ever come back: the policy
 * on conversation_nicknames lets you read only your own, so this does not
 * have to filter and could not leak if it forgot.
 *
 * Renaming is applied before the server answers. It is your own label on
 * your own device and the write cannot be refused for anything you could
 * have known in advance — you are in the chat, they are in the chat — so
 * waiting on a round trip to show it would only make it feel broken. If
 * it does fail, the old name comes back.
 */
export function useNicknames(conversationId: string) {
  // Made once. A fresh client per render changes the identity of every
  // callback below it, which is what put ScheduledStrip in a render loop.
  const [supabase] = useState(createClient);
  const [nicknames, setNicknames] = useState<Nicknames>({});

  useEffect(() => {
    let dropped = false;
    void (async () => {
      const { data } = await supabase
        .from("conversation_nicknames")
        .select("subject_id, nickname")
        .eq("conversation_id", conversationId);
      if (dropped || !data) return;
      const next: Record<string, string> = {};
      for (const row of data as { subject_id: string; nickname: string }[]) {
        next[row.subject_id] = row.nickname;
      }
      setNicknames(next);
    })();
    return () => {
      dropped = true;
    };
  }, [supabase, conversationId]);

  /** Name someone, or pass a blank name to stop. Returns whether it stuck. */
  const rename = useCallback(
    async (subjectId: string, name: string): Promise<boolean> => {
      const clean = name.trim().slice(0, 40);
      let previous: string | undefined;
      setNicknames((prev) => {
        previous = prev[subjectId];
        const next = { ...prev };
        if (clean) next[subjectId] = clean;
        else delete next[subjectId];
        return next;
      });

      const { error } = await supabase.rpc("set_nickname", {
        p_conversation_id: conversationId,
        p_subject_id: subjectId,
        p_nickname: clean,
      });
      if (!error) return true;

      setNicknames((prev) => {
        const back = { ...prev };
        if (previous === undefined) delete back[subjectId];
        else back[subjectId] = previous;
        return back;
      });
      return false;
    },
    [supabase, conversationId],
  );

  return { nicknames, rename };
}
