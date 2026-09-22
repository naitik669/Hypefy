"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/ToastProvider";
import { EmptyScene, ScenePop } from "@/components/empty/EmptyScene";
import { PlaneArt } from "@/components/empty/scenes";
import { FollowButton } from "@/components/profile/FollowButton";
import { shareProfile } from "@/components/growth/InviteButton";
import { haptics } from "@/lib/haptics";

type Person = {
  id: string;
  name: string;
  username: string | null;
  hue: number;
  avatarUrl: string | null;
};

type Suggestions = {
  active: Person[];
  mutuals: Person[];
  maybe: Person[];
  myUsername: string | null;
};

const ONLINE_MS = 90_000;
const MAX_ACTIVE = 4;
const MAX_MUTUALS = 3;
const MAX_MAYBE = 3;

/** When the plane has gone and the words have landed, the people pop in. */
const FACES_AT = 4.05;
const CARDS_AT = 4.5;
const STEP = 0.12;

const miniClass =
  "inline-flex items-center justify-center rounded-[10px] px-3 py-1.5 text-[11.5px] font-extrabold transition-transform active:scale-95";

function toPerson(p: {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_hue: number | null;
  avatar_url: string | null;
}): Person {
  return {
    id: p.id,
    name: p.display_name ?? p.username ?? "User",
    username: p.username,
    hue: p.avatar_hue ?? 280,
    avatarUrl: p.avatar_url,
  };
}

async function loadSuggestions(me: string): Promise<Suggestions> {
  const supabase = createClient();
  const [following, followers, suggested, mine] = await Promise.all([
    supabase.from("follows").select("following_id").eq("follower_id", me).limit(500),
    supabase.from("follows").select("follower_id").eq("following_id", me).limit(500),
    supabase.rpc("get_suggested_people", { p_limit: 8 }),
    supabase.from("profiles").select("username").eq("id", me).maybeSingle(),
  ]);

  const followingIds = (following.data ?? []).map((r) => r.following_id);
  const followerIds = new Set((followers.data ?? []).map((r) => r.follower_id));

  const { data: people } = followingIds.length
    ? await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_hue, avatar_url, last_seen_at, show_activity")
        .in("id", followingIds.slice(0, 200))
    : { data: [] };

  const list = people ?? [];
  const active = list
    .filter(
      (p) =>
        p.show_activity !== false &&
        !!p.last_seen_at &&
        Date.now() - new Date(p.last_seen_at).getTime() < ONLINE_MS,
    )
    .slice(0, MAX_ACTIVE)
    .map(toPerson);
  const mutuals = list
    .filter((p) => followerIds.has(p.id))
    .slice(0, MAX_MUTUALS)
    .map(toPerson);

  const skip = new Set([me, ...followingIds]);
  const maybe = (suggested.data ?? [])
    .filter((p) => !skip.has(p.id))
    .slice(0, MAX_MAYBE)
    .map(toPerson);

  return { active, mutuals, maybe, myUsername: mine.data?.username ?? null };
}

/**
 * The inbox with no conversations: the paper plane swings in and flies off,
 * the words land, then people to talk to pop in below it: who's online now,
 * mutuals to message, people you may know to follow, and an invite.
 */
export function EmptyInbox({ currentUserId }: { currentUserId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<Suggestions | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadSuggestions(currentUserId)
      .then((d) => alive && setData(d))
      // The scene still says what to do; the suggestions are a bonus.
      .catch(() => alive && setData({ active: [], mutuals: [], maybe: [], myUsername: null }));
    return () => {
      alive = false;
    };
  }, [currentUserId]);

  async function openDm(p: Person) {
    if (opening) return;
    haptics.tap();
    setOpening(p.id);
    const { data: convId, error } = await createClient().rpc("get_or_create_dm", { p_other: p.id });
    if (error || !convId) {
      setOpening(null);
      toast(`Couldn't open a chat with ${p.name}. Try again.`, "error");
      return;
    }
    router.push(`/messages/${convId}`);
  }

  async function invite() {
    if ((await shareProfile(data?.myUsername ?? null)) === "copied") toast("Invite link copied");
  }

  let n = 0;
  const cardAt = () => CARDS_AT + STEP * n++;

  return (
    <EmptyScene
      art={<PlaneArt />}
      title="No DMs yet"
      text="Slide into someone's."
      timing={{ head: 3.6, sub: 3.75 }}
      className="px-4 pb-14 pt-8"
    >
      {data && data.active.length > 0 && (
        <div className="mt-4 flex justify-center gap-4">
          {data.active.map((p, i) => (
            <ScenePop key={p.id} at={FACES_AT + STEP * i}>
              <button
                type="button"
                onClick={() => openDm(p)}
                className="flex w-14 flex-col items-center gap-1 text-[10.5px] font-semibold text-muted"
              >
                <span className="relative">
                  <Avatar name={p.name} hue={p.hue} size={44} src={p.avatarUrl ?? undefined} />
                  <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background bg-green-500" />
                </span>
                <span className="w-full truncate">{p.name}</span>
              </button>
            </ScenePop>
          ))}
        </div>
      )}

      {data && (
        <div className="no-scrollbar -mx-4 mt-4 flex w-[calc(100%+2rem)] gap-2.5 overflow-x-auto px-4 pb-1">
          {data.mutuals.map((p) => (
            <ScenePop key={p.id} at={cardAt()} className="shrink-0">
              <Card person={p} note="Mutual">
                <button
                  type="button"
                  onClick={() => openDm(p)}
                  disabled={opening === p.id}
                  className={`${miniClass} bg-accent text-accent-ink disabled:opacity-60`}
                >
                  Message
                </button>
              </Card>
            </ScenePop>
          ))}
          {data.maybe.map((p) => (
            <ScenePop key={p.id} at={cardAt()} className="shrink-0">
              <Card person={p} note="You may know">
                <FollowButton
                  targetUserId={p.id}
                  initialFollowing={false}
                  variant="mini"
                />
              </Card>
            </ScenePop>
          ))}
          <ScenePop at={cardAt()} className="shrink-0">
            <div className="flex w-[116px] flex-col items-center gap-1.5 rounded-2xl bg-surface px-2.5 py-3 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-white/25 text-lg text-muted">
                +
              </span>
              <b className="text-xs">Invite</b>
              <small className="text-[10.5px] text-muted">A friend</small>
              <button type="button" onClick={invite} className={`${miniClass} bg-elevated text-foreground`}>
                Share
              </button>
            </div>
          </ScenePop>
        </div>
      )}
    </EmptyScene>
  );
}

function Card({ person, note, children }: { person: Person; note: string; children: React.ReactNode }) {
  return (
    <div className="flex w-[116px] flex-col items-center gap-1.5 rounded-2xl bg-surface px-2.5 py-3 text-center">
      <Avatar name={person.name} hue={person.hue} size={44} src={person.avatarUrl ?? undefined} />
      <b className="w-full truncate text-xs">{person.name}</b>
      <small className="text-[10.5px] text-muted">{note}</small>
      {children}
    </div>
  );
}
