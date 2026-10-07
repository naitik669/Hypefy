"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, LogOut, Search, UserPlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/ToastProvider";
import { haptics } from "@/lib/haptics";
import {
  invite,
  loadCandidates,
  loadMembers,
  removeMember,
  whoIs,
  type PlaylistMember,
  type PlaylistPerson,
  type PlaylistRole,
} from "@/lib/playlists";

/**
 * Who a playlist is shared with.
 *
 * A row of faces under the playlist's name; tapping it opens the list. The
 * owner invites from it (people they follow who follow them back) and can
 * remove anyone or take back an invitation. A member sees who else is in it
 * and can leave. Until a playlist is shared, its owner sees only "Invite".
 */
export function PlaylistPeople({
  playlistId,
  playlistName,
  role,
  userId,
  onLeft,
}: {
  playlistId: string;
  playlistName: string;
  role: PlaylistRole;
  userId: string;
  /** This person left the playlist: it is no longer theirs to see. */
  onLeft: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [members, setMembers] = useState<PlaylistMember[]>([]);
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<PlaylistPerson[] | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const owner = role === "owner";

  useEffect(() => {
    let live = true;
    void loadMembers(supabase, playlistId).then((m) => {
      if (live) setMembers(m);
    });
    return () => {
      live = false;
    };
  }, [supabase, playlistId]);

  useEffect(() => {
    if (!open || !owner) return;
    let live = true;
    void loadCandidates(supabase, playlistId).then((c) => {
      if (live) setCandidates(c);
    });
    return () => {
      live = false;
    };
  }, [open, owner, supabase, playlistId]);

  async function send(p: PlaylistPerson) {
    if (busy) return;
    setBusy(p.id);
    const failed = await invite(supabase, playlistId, p.id);
    setBusy(null);
    if (failed) return toast(failed, "error");
    haptics.success();
    setCandidates((c) => (c ?? []).filter((x) => x.id !== p.id));
    setMembers((m) => [...m, { ...p, status: "invited", isOwner: false }]);
    toast(`Invited ${whoIs(p)}`, "success");
  }

  async function remove(m: PlaylistMember) {
    if (busy) return;
    setBusy(m.id);
    const failed = await removeMember(supabase, playlistId, m.id);
    setBusy(null);
    if (failed) return toast(failed, "error");
    setMembers((l) => l.filter((x) => x.id !== m.id));
    toast(m.status === "invited" ? "Invitation taken back" : `Removed ${whoIs(m)}`);
  }

  async function leave() {
    setLeaving(false);
    const failed = await removeMember(supabase, playlistId);
    if (failed) return toast(failed, "error");
    toast(`Left ${playlistName}`);
    onLeft();
  }

  const joined = members.filter((m) => m.status === "joined");
  const others = joined.filter((m) => !m.isOwner).length;
  const term = q.trim().toLowerCase();
  const shown = (candidates ?? []).filter(
    (p) => !term || p.name.toLowerCase().includes(term) || (p.username ?? "").toLowerCase().includes(term),
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-playlist-people
        aria-label={owner && others === 0 ? "Invite people to this playlist" : "People in this playlist"}
        className="mt-3 flex items-center gap-2 rounded-pill bg-elevated py-1.5 pl-1.5 pr-3.5 text-xs font-bold ring-1 ring-border"
      >
        {others > 0 || !owner ? (
          <>
            <span className="flex -space-x-2">
              {joined.slice(0, 4).map((m) => (
                <Avatar key={m.id} name={m.name} hue={m.hue} size={24} src={m.avatarUrl ?? undefined} className="ring-2 ring-background" />
              ))}
            </span>
            {joined.length} {joined.length === 1 ? "person" : "people"}
          </>
        ) : (
          <>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-ink">
              <UserPlus size={13} strokeWidth={2.6} />
            </span>
            Invite
          </>
        )}
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="People" size="tall">
        <div className="flex flex-col pb-4">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-2 py-2.5">
              <Avatar name={m.name} hue={m.hue} size={40} src={m.avatarUrl ?? undefined} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {m.name}
                  {m.id === userId ? " (you)" : ""}
                </p>
                <p className="truncate text-xs text-muted">
                  {m.isOwner ? "Owner" : m.status === "invited" ? "Invited, hasn't answered" : "Can add and edit"}
                </p>
              </div>
              {owner && !m.isOwner && (
                <button
                  type="button"
                  onClick={() => void remove(m)}
                  disabled={busy === m.id}
                  aria-label={m.status === "invited" ? `Take back ${whoIs(m)}'s invitation` : `Remove ${whoIs(m)}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:text-foreground"
                >
                  {busy === m.id ? <Loader2 size={15} className="animate-spin" /> : <X size={17} />}
                </button>
              )}
            </div>
          ))}

          {!owner && (
            <button
              type="button"
              onClick={() => setLeaving(true)}
              className="mx-2 mt-2 flex h-11 items-center justify-center gap-2 rounded-2xl border border-border text-sm font-bold text-danger"
            >
              <LogOut size={16} /> Leave playlist
            </button>
          )}

          {owner && (
            <>
              <p className="px-2 pb-1 pt-5 text-xs font-bold uppercase tracking-widest text-faint">Invite</p>
              <p className="px-2 pb-2 text-xs leading-relaxed text-muted">
                People you follow who follow you back. They can add and remove things and rename the playlist. Only you
                can delete it.
              </p>
              <div className="mx-2 mb-1 flex h-10 items-center gap-2 rounded-2xl border border-border bg-surface px-3">
                <Search size={16} className="shrink-0 text-faint" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search"
                  aria-label="Search people to invite"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
                />
              </div>
              {candidates === null ? (
                <div className="flex justify-center py-8">
                  <Loader2 size={20} className="animate-spin text-muted" />
                </div>
              ) : shown.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-muted">
                  {candidates.length === 0 ? "Nobody left to invite." : "Nobody by that name."}
                </p>
              ) : (
                shown.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 px-2 py-2">
                    <Avatar name={p.name} hue={p.hue} size={40} src={p.avatarUrl ?? undefined} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{p.name}</p>
                      {p.username && <p className="truncate text-xs text-muted">@{p.username}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => void send(p)}
                      disabled={busy === p.id}
                      className="flex h-9 min-w-[72px] shrink-0 items-center justify-center rounded-xl bg-accent px-3 text-xs font-extrabold text-accent-ink disabled:opacity-60"
                    >
                      {busy === p.id ? <Loader2 size={14} className="animate-spin" /> : "Invite"}
                    </button>
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={leaving}
        onClose={() => setLeaving(false)}
        onConfirm={leave}
        icon={LogOut}
        title={`Leave ${playlistName}?`}
        body="It comes off your shelf. What you added stays in it, and stays in your Library."
        confirmLabel="Leave"
      />
    </>
  );
}
