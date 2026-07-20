"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Star, Loader2, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { haptics } from "@/lib/haptics";

type Person = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_hue: number | null;
  avatar_url: string | null;
};

/**
 * Empty state for the Hypers tab when the user hasn't picked any closest
 * friends yet. Suggests people from their existing social graph (who they
 * follow + who follows them) since Hypers is meant to be a subset of people
 * you already know, not a stranger-discovery surface like PeopleToFollow.
 */
export function AddHypersPrompt({ currentUserId }: { currentUserId: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const [{ data: following }, { data: followers }] = await Promise.all([
        supabase
          .from("follows")
          .select("profiles:profiles!follows_following_id_fkey(id, display_name, username, avatar_hue, avatar_url)")
          .eq("follower_id", currentUserId),
        supabase
          .from("follows")
          .select("profiles:profiles!follows_follower_id_fkey(id, display_name, username, avatar_hue, avatar_url)")
          .eq("following_id", currentUserId),
      ]);

      const byId = new Map<string, Person>();
      for (const row of [...(following ?? []), ...(followers ?? [])] as any[]) {
        const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        if (p && !byId.has(p.id)) byId.set(p.id, p);
      }
      if (active) setPeople([...byId.values()]);
    })();
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addHyper(id: string) {
    if (pendingId) return;
    setPendingId(id);
    haptics.select();
    const { error } = await supabase.from("close_friends").insert({ user_id: currentUserId, friend_id: id });
    if (!error) {
      setAdded((prev) => new Set(prev).add(id));
      router.refresh();
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

  return (
    <div className="animate-rise flex flex-col gap-4 px-4 py-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface text-muted">
          <Star size={28} />
        </div>
        <h2 className="text-lg font-bold">No Hypers yet</h2>
        <p className="max-w-xs text-sm text-muted">
          Hypers are your closest friends, pick a few below to see their posts here first.
        </p>
      </div>

      {people.length === 0 ? (
        <p className="px-6 py-6 text-center text-xs text-muted">
          Follow some people first, then come back to pick your Hypers.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {people.map((p) => {
            const name = p.display_name ?? p.username ?? "User";
            const isAdded = added.has(p.id);
            const href = p.username ? `/u/${p.username}` : "#";
            return (
              <div
                key={p.id}
                className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition-colors ${
                  isAdded ? "border-accent/30 bg-accent/[0.05]" : "border-border bg-surface"
                }`}
              >
                <Link href={href}>
                  <Avatar name={name} hue={p.avatar_hue ?? 280} size={44} src={p.avatar_url ?? undefined} />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link href={href} className="block truncate text-sm font-semibold hover:underline">{name}</Link>
                  {p.username && <p className="truncate text-xs text-muted">@{p.username}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => addHyper(p.id)}
                  disabled={isAdded || pendingId === p.id}
                  className={`flex h-9 min-w-[84px] items-center justify-center gap-1 rounded-xl text-xs font-bold transition-transform active:scale-95 disabled:opacity-60 ${
                    isAdded ? "border border-border bg-elevated text-foreground" : "bg-accent text-accent-ink"
                  }`}
                >
                  {pendingId === p.id ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : isAdded ? (
                    <><Check size={13} /> Added</>
                  ) : (
                    "Add"
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
