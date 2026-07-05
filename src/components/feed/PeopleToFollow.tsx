"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Loader2, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { haptics } from "@/lib/haptics";

type Person = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_hue: number | null;
  avatar_url: string | null;
  bio: string | null;
};

/**
 * Inline "people to follow" rescue for empty feeds. Loads suggestions via the
 * get_suggested_people RPC (falling back to recent completed profiles if the
 * RPC returns nothing), lets the user follow right here, and updates optimistically.
 */
export function PeopleToFollow({
  currentUserId,
  followingIds = [],
  heading = "Find your people",
  sub = "Follow a few creators to fill your feed.",
}: {
  currentUserId: string;
  followingIds?: string[];
  heading?: string;
  sub?: string;
}) {
  const supabase = createClient();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      // Prefer the suggestion RPC; fall back to recent completed profiles.
      const { data: suggested } = await supabase.rpc("get_suggested_people", { p_limit: 12 });
      let list = (suggested ?? []) as Person[];
      if (list.length === 0) {
        const { data } = await supabase
          .from("profiles")
          .select("id, display_name, username, avatar_hue, avatar_url, bio")
          .eq("profile_completed", true)
          .neq("id", currentUserId)
          .order("created_at", { ascending: false })
          .limit(12);
        list = (data ?? []) as Person[];
      }
      const exclude = new Set([currentUserId, ...followingIds]);
      if (active) setPeople(list.filter((p) => !exclude.has(p.id)));
    })();
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggle(p: Person) {
    if (pendingId) return;
    const id = p.id;
    const isFollowed = followed.has(id);
    setPendingId(id);
    haptics.select();
    setFollowed((prev) => {
      const next = new Set(prev);
      if (isFollowed) next.delete(id); else next.add(id);
      return next;
    });

    if (isFollowed) {
      const { error } = await supabase.from("follows").delete().eq("follower_id", currentUserId).eq("following_id", id);
      if (error) setFollowed((prev) => new Set(prev).add(id));
    } else {
      const { error } = await supabase.from("follows").insert({ follower_id: currentUserId, following_id: id });
      if (!error) {
        await supabase.from("notifications").insert({
          user_id: id, actor_id: currentUserId, type: "follow",
          target_type: "profile", target_id: id, body: "started following you",
        });
      } else {
        setFollowed((prev) => { const next = new Set(prev); next.delete(id); return next; });
      }
    }
    setPendingId(null);
  }

  if (people === null) {
    return (
      <div className="flex flex-col gap-2 px-4 py-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="skeleton h-11 w-11 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <div className="skeleton h-3 w-1/3 rounded" />
              <div className="skeleton h-2.5 w-1/4 rounded" />
            </div>
            <div className="skeleton h-8 w-20 rounded-xl" />
          </div>
        ))}
      </div>
    );
  }

  if (people.length === 0) {
    return (
      <div className="px-6 py-14 text-center">
        <p className="text-sm font-semibold">No suggestions right now</p>
        <p className="mt-1 text-xs text-muted">Check back soon — the community is growing.</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-5">
      <div className="mb-3 flex items-center gap-2">
        <UserPlus size={18} className="text-accent" />
        <div>
          <h2 className="text-base font-bold leading-tight">{heading}</h2>
          <p className="text-xs text-muted">{sub}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {people.map((p) => {
          const name = p.display_name ?? p.username ?? "User";
          const isF = followed.has(p.id);
          const href = p.username ? `/u/${p.username}` : "#";
          return (
            <div
              key={p.id}
              className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition-colors ${
                isF ? "border-accent/30 bg-accent/[0.05]" : "border-border bg-surface"
              }`}
            >
              <Link href={href}>
                <Avatar name={name} hue={p.avatar_hue ?? 280} size={44} src={p.avatar_url ?? undefined} />
              </Link>
              <div className="min-w-0 flex-1">
                <Link href={href} className="block truncate text-sm font-semibold hover:underline">{name}</Link>
                {p.username && <p className="truncate text-xs text-muted">@{p.username}</p>}
                {p.bio && <p className="mt-0.5 truncate text-xs text-faint">{p.bio}</p>}
              </div>
              <button
                type="button"
                onClick={() => toggle(p)}
                disabled={pendingId === p.id}
                className={`flex h-9 min-w-[84px] items-center justify-center gap-1 rounded-xl text-xs font-bold transition-transform active:scale-95 disabled:opacity-60 ${
                  isF ? "border border-border bg-elevated text-foreground" : "bg-accent text-accent-ink"
                }`}
              >
                {pendingId === p.id ? <Loader2 size={13} className="animate-spin" /> : isF ? <><Check size={13} /> Following</> : "Follow"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
