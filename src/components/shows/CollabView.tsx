"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, UserPlus, LogOut, Check, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { isVideoUrl } from "@/lib/video-mime";
import { BLANK_POSTER } from "@/lib/blank-poster";
import {
  canPostInto,
  contributorLine,
  hasRoom,
  memberState,
  COLLAB_CAP,
  type CollabMember,
} from "@/lib/show-collab";

/**
 * One shared Show.
 *
 * The cover, who is behind it, and what they have posted. Every Show
 * here still belongs to whoever posted it and opens in the ordinary
 * viewer — the collab is the cover they also appear under, not an
 * owner of them.
 */

export type CollabPerson = {
  id: string;
  name: string;
  username: string | null;
  hue: number;
  avatarUrl: string | null;
  joined: boolean;
};

export type CollabShow = {
  id: string;
  media_url: string;
  caption: string | null;
  user_id: string;
  expires_at: string;
};

export function CollabView({
  collabId,
  title,
  ownerId,
  people,
  shows,
  viewerId,
  candidates,
}: {
  collabId: string;
  title: string;
  ownerId: string;
  people: CollabPerson[];
  shows: CollabShow[];
  viewerId: string | null;
  /** People the viewer could invite: who they follow. */
  candidates: CollabPerson[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [supabase] = useState(createClient);
  const [busy, setBusy] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  /** Invited this session, so the sheet stops offering them again. */
  const [justInvited, setJustInvited] = useState<string[]>([]);

  const members: CollabMember[] = useMemo(
    () => people.map((p) => ({ userId: p.id, joined: p.joined })),
    [people],
  );
  const state = memberState(ownerId, members, viewerId);
  const joined = people.filter((p) => p.joined);
  const room = hasRoom(members) && justInvited.length + members.length < COLLAB_CAP;

  async function join() {
    setBusy(true);
    const { error } = await supabase.rpc("join_show_collab", { p_collab: collabId });
    setBusy(false);
    if (error) {
      toast("Couldn't join that. Try again.");
      return;
    }
    router.refresh();
  }

  async function invite(userId: string) {
    const { error } = await supabase.rpc("invite_to_show_collab", {
      p_collab: collabId,
      p_user: userId,
    });
    if (error) {
      toast("Couldn't invite them.");
      return;
    }
    setJustInvited((v) => [...v, userId]);
  }

  async function leave() {
    setBusy(true);
    const { error } = await supabase.rpc("leave_show_collab", { p_collab: collabId });
    setBusy(false);
    setLeaving(false);
    if (error) {
      toast("Couldn't do that. Try again.");
      return;
    }
    router.replace("/shows");
  }

  const offerable = candidates.filter(
    (c) => !members.some((m) => m.userId === c.id) && !justInvited.includes(c.id),
  );

  return (
    <div className="px-4 pb-10 pt-3">
      <header className="mb-5">
        <h1 className="text-2xl font-extrabold leading-tight">{title}</h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
          <Users size={14} />
          {contributorLine(joined.map((p) => p.name))}
        </p>
      </header>

      {/* Who is behind it. An invitation that has not been accepted is
          shown faded rather than hidden: the people already in it should
          be able to see that somebody was asked. */}
      <div className="mb-5 flex flex-wrap gap-2">
        {people.map((p) => (
          <span
            key={p.id}
            className={`flex items-center gap-2 rounded-pill bg-surface py-1 pl-1 pr-3 text-xs font-semibold ${
              p.joined ? "" : "opacity-50"
            }`}
          >
            <Avatar name={p.name} hue={p.hue} size={24} src={p.avatarUrl ?? undefined} />
            {p.name}
            {!p.joined && <span className="text-[10px] font-bold text-faint">asked</span>}
          </span>
        ))}
      </div>

      {state === "invited" && (
        <div className="mb-5 rounded-2xl border border-accent/40 bg-accent/[0.06] p-4">
          <p className="text-sm font-semibold">You were asked to join this Show.</p>
          <p className="mt-1 text-xs text-muted">
            Join and what you post into it shows up for everybody else in it.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={join}
            className="mt-3 h-11 w-full rounded-xl bg-accent text-sm font-extrabold text-accent-ink disabled:opacity-50"
          >
            Join it
          </button>
        </div>
      )}

      {canPostInto(state) && (
        <div className="mb-5 flex gap-2">
          <Link
            href={`/create?mode=show&collab=${collabId}`}
            className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent text-sm font-extrabold text-accent-ink active:scale-[0.99]"
          >
            <Plus size={16} /> Add to it
          </Link>
          <button
            type="button"
            disabled={!room}
            onClick={() => setInviting(true)}
            aria-label="Invite somebody"
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-elevated text-foreground disabled:opacity-40"
          >
            <UserPlus size={17} />
          </button>
          <button
            type="button"
            onClick={() => setLeaving(true)}
            aria-label={state === "owner" ? "Close this Show" : "Leave this Show"}
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-elevated text-muted"
          >
            <LogOut size={17} />
          </button>
        </div>
      )}

      {shows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nothing in it yet"
          text={
            canPostInto(state)
              ? "Add the first one and everybody else in it will see it."
              : "Nobody has posted into this one yet."
          }
          variant="compact"
        />
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {shows.map((s) => {
            const who = people.find((p) => p.id === s.user_id);
            return (
              <Link
                key={s.id}
                href={`/shows/${s.id}`}
                className="relative aspect-[3/4] overflow-hidden rounded-xl bg-black"
              >
                {isVideoUrl(s.media_url) ? (
                  <video
                    poster={BLANK_POSTER}
                    src={s.media_url}
                    muted
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.media_url} alt={s.caption ?? "Show"} className="h-full w-full object-cover" />
                )}
                {/* Whose it is. On a shared reel this is the thing you
                    most want to know about a tile, and it is the one
                    thing a grid of covers never says. */}
                {who && (
                  <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/85 to-transparent px-1.5 pb-1.5 pt-5">
                    <Avatar name={who.name} hue={who.hue} size={16} src={who.avatarUrl ?? undefined} />
                    <span className="truncate text-[10px] font-bold text-white">{who.name}</span>
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}

      <BottomSheet open={inviting} onClose={() => setInviting(false)} title="Ask somebody in" size="tall">
        <div className="space-y-1 px-4 pb-4">
          <p className="pb-2 text-xs text-muted">
            Anybody in a shared Show can bring somebody in. {COLLAB_CAP} people at most.
          </p>
          {offerable.length === 0 && (
            <p className="py-8 text-center text-sm text-muted">Nobody left to ask.</p>
          )}
          {offerable.map((person) => (
            <button
              key={person.id}
              type="button"
              onClick={() => void invite(person.id)}
              className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/5"
            >
              <Avatar name={person.name} hue={person.hue} size={36} src={person.avatarUrl ?? undefined} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{person.name}</span>
                {person.username && (
                  <span className="block truncate text-xs text-muted">@{person.username}</span>
                )}
              </span>
              <UserPlus size={16} className="shrink-0 text-muted" />
            </button>
          ))}
          {justInvited.length > 0 && (
            <p className="flex items-center gap-1.5 pt-3 text-xs text-accent">
              <Check size={13} /> Asked {justInvited.length}{" "}
              {justInvited.length === 1 ? "person" : "people"}.
            </p>
          )}
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={leaving}
        onClose={() => setLeaving(false)}
        onConfirm={leave}
        title={state === "owner" ? "Close this Show?" : "Leave this Show?"}
        body={
          state === "owner"
            ? "It closes for everybody in it. Nobody's Shows are deleted — they just stop appearing under this cover."
            : "What you posted into it stays yours. It just stops appearing under this cover."
        }
        confirmLabel={state === "owner" ? "Close it" : "Leave"}
      />
    </div>
  );
}
