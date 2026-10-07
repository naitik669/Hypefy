"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/ToastProvider";
import { haptics } from "@/lib/haptics";
import { answerInvite, whoIs, type PlaylistInvite } from "@/lib/playlists";

/**
 * Playlists you have been invited to, at the top of your Library.
 *
 * An invitation has to be accepted: nobody can put a playlist on your shelf
 * for you. Declining takes it away and does not tell them.
 */
export function PlaylistInvites({
  initial,
  onJoined,
}: {
  initial: PlaylistInvite[];
  /** One was accepted: the shelf has a new playlist on it. */
  onJoined: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [invites, setInvites] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  async function answer(inv: PlaylistInvite, accept: boolean) {
    if (busy) return;
    setBusy(inv.playlistId);
    const failed = await answerInvite(supabase, inv.playlistId, accept);
    setBusy(null);
    if (failed) {
      toast(failed, "error");
      // Gone either way: withdrawn, or the playlist was deleted.
      if (failed.includes("gone")) setInvites((l) => l.filter((i) => i.playlistId !== inv.playlistId));
      return;
    }
    setInvites((l) => l.filter((i) => i.playlistId !== inv.playlistId));
    if (accept) {
      haptics.success();
      toast(`Joined ${inv.name}`, "success");
      onJoined();
    }
  }

  if (invites.length === 0) return null;

  return (
    <section className="flex flex-col gap-2 px-4 pt-3" data-playlist-invites>
      {invites.map((inv) => (
        <div key={inv.playlistId} className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-3 py-3">
          <Avatar name={inv.owner.name} hue={inv.owner.hue} size={40} src={inv.owner.avatarUrl ?? undefined} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {inv.emoji ? `${inv.emoji} ` : ""}
              {inv.name}
            </p>
            <p className="truncate text-xs text-muted">
              {whoIs(inv.owner)} invited you
            </p>
          </div>
          <button
            type="button"
            onClick={() => void answer(inv, false)}
            disabled={busy === inv.playlistId}
            className="h-9 shrink-0 rounded-xl px-2.5 text-xs font-bold text-muted"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => void answer(inv, true)}
            disabled={busy === inv.playlistId}
            className="h-9 shrink-0 rounded-xl bg-accent px-3.5 text-xs font-extrabold text-accent-ink disabled:opacity-60"
          >
            Join
          </button>
        </div>
      ))}
    </section>
  );
}
