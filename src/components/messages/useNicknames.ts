"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { mergeNicknames, tidyNickname, type Nicknames } from "@/lib/nicknames";

/**
 * What this chat calls the people in it.
 *
 * Two tables, one answer. The shared names (0176) are what everybody in
 * the chat sees and what renaming now writes; the private ones (0169) are
 * what one person alone called somebody, still honoured where no shared
 * name exists so nothing set earlier vanishes. `mergeNicknames` decides
 * which wins, in one place, so every surface agrees.
 *
 * Two queries per conversation rather than two per member — a group of
 * twenty is two round trips, in parallel.
 *
 * Renaming is applied before the server answers. It is a label, the write
 * cannot be refused for anything you could not have known in advance —
 * you are in the chat, they are in the chat — and waiting on a round trip
 * to show it would only make it feel broken. If it does fail, the old
 * name comes back.
 */
type Row = { subject_id: string; nickname: string };

/** Rows to a map of who they are for. Module scope: it closes over nothing. */
function byId(rows: Row[] | null): Nicknames {
  const next: Record<string, string> = {};
  for (const row of rows ?? []) next[row.subject_id] = row.nickname;
  return next;
}

export function useNicknames(conversationId: string) {
  // Made once. A fresh client per render changes the identity of every
  // callback below it, which is what put ScheduledStrip in a render loop.
  const [supabase] = useState(createClient);
  const [shared, setShared] = useState<Nicknames>({});
  const [personal, setPersonal] = useState<Nicknames>({});

  const load = useCallback(async () => {
    const [mine, ours] = await Promise.all([
      supabase
        .from("conversation_nicknames")
        .select("subject_id, nickname")
        .eq("conversation_id", conversationId),
      supabase
        .from("conversation_display_names")
        .select("subject_id, nickname")
        .eq("conversation_id", conversationId),
    ]);
    return { mine: mine.data, ours: ours.data };
  }, [supabase, conversationId]);

  useEffect(() => {
    let dropped = false;
    void (async () => {
      const { mine, ours } = await load();
      if (dropped) return;
      // Nobody else's private rows ever come back: the policy on
      // conversation_nicknames lets you read only your own, so this does
      // not have to filter and could not leak if it forgot. The shared
      // ones are the whole chat's by design, and still only the chat's.
      if (mine) setPersonal(byId(mine as Row[]));
      if (ours) setShared(byId(ours as Row[]));
    })();
    return () => {
      dropped = true;
    };
  }, [load]);

  /**
   * Read the shared names again.
   *
   * The thread calls this when a system message arrives, which is how a
   * rename somebody else made reaches this screen — the same cue chat
   * themes use, and the reason the change is announced at all. Private
   * names cannot change behind your back, so they are not re-read.
   */
  const refresh = useCallback(async () => {
    const { ours } = await load();
    if (ours) setShared(byId(ours as Row[]));
  }, [load]);

  /**
   * Name someone for the whole chat, or pass a blank name to clear it.
   *
   * Returns whether it stuck. Anyone in the chat may name anyone in it,
   * themselves included: in a DM that is "mine and theirs", and in a
   * group it is what every other group chat does.
   */
  const rename = useCallback(
    async (subjectId: string, name: string): Promise<boolean> => {
      const clean = tidyNickname(name);
      let previous: string | undefined;
      setShared((prev) => {
        previous = prev[subjectId];
        const next = { ...prev };
        if (clean) next[subjectId] = clean;
        else delete next[subjectId];
        return next;
      });

      const { error } = await supabase.rpc("set_shared_nickname", {
        p_conversation_id: conversationId,
        p_subject_id: subjectId,
        p_nickname: clean,
      });
      if (!error) return true;

      setShared((prev) => {
        const back = { ...prev };
        if (previous === undefined) delete back[subjectId];
        else back[subjectId] = previous;
        return back;
      });
      return false;
    },
    [supabase, conversationId],
  );

  const nicknames = useMemo(() => mergeNicknames(shared, personal), [shared, personal]);

  return { nicknames, shared, rename, refresh };
}
