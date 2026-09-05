"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Heart, Plus, Star, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/ToastProvider";
import { haptics } from "@/lib/haptics";

export type CirclePerson = {
  id: string;
  name: string;
  username: string | null;
  hue: number;
  avatarUrl: string | null;
};

export type CircleKind = "hypers" | "favourites";

/** The two circles differ only in a table name and some words. */
const SPEC: Record<
  CircleKind,
  { table: "close_friends" | "favorites"; icon: typeof Star; verb: string; blurb: string }
> = {
  hypers: {
    table: "close_friends",
    icon: Star,
    verb: "Hyper",
    blurb: "Your closest people. Their posts come first in the Hypers feed, and they're never told.",
  },
  favourites: {
    table: "favorites",
    icon: Heart,
    verb: "Favourite",
    blurb: "People you don't want to miss. Their posts get their own feed, privately.",
  },
};

/**
 * Your Hypers or Favourites, as a list you can actually see and edit.
 *
 * Before this there was no list at all. You could add someone from two
 * overflow menus and then never review the set — and AddHypersPrompt, the one
 * surface that suggested anybody, only rendered while you had zero, so it
 * vanished exactly when a list started being worth having. Suggestions live
 * here permanently instead, drawn from people you already follow or who
 * follow you, since these circles are a subset of people you know rather than
 * a discovery surface.
 */
export function CircleList({
  kind,
  currentUserId,
  initial,
}: {
  kind: CircleKind;
  currentUserId: string;
  initial: CirclePerson[];
}) {
  const spec = SPEC[kind];
  const supabase = createClient();
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState(initial);
  const [suggestions, setSuggestions] = useState<CirclePerson[] | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const inList = useMemo(() => new Set(rows.map((r) => r.id)), [rows]);

  // People you already know, minus the ones already in the circle.
  useEffect(() => {
    let active = true;
    (async () => {
      const [{ data: following }, { data: followers }] = await Promise.all([
        supabase
          .from("follows")
          .select(
            "profiles:profiles!follows_following_id_fkey(id, display_name, username, avatar_hue, avatar_url)"
          )
          .eq("follower_id", currentUserId)
          .limit(300),
        supabase
          .from("follows")
          .select(
            "profiles:profiles!follows_follower_id_fkey(id, display_name, username, avatar_hue, avatar_url)"
          )
          .eq("following_id", currentUserId)
          .limit(300),
      ]);

      const byId = new Map<string, CirclePerson>();
      for (const row of [...(following ?? []), ...(followers ?? [])] as Record<
        string,
        unknown
      >[]) {
        const raw = row.profiles as Record<string, unknown> | Record<string, unknown>[] | null;
        const p = Array.isArray(raw) ? raw[0] : raw;
        if (!p) continue;
        const id = p.id as string;
        if (byId.has(id)) continue;
        byId.set(id, {
          id,
          name: (p.display_name as string) ?? (p.username as string) ?? "User",
          username: (p.username as string) ?? null,
          hue: (p.avatar_hue as number) ?? 280,
          avatarUrl: (p.avatar_url as string) ?? null,
        });
      }
      if (active) setSuggestions([...byId.values()]);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  async function add(person: CirclePerson) {
    if (pending) return;
    setPending(person.id);
    haptics.select();
    const { error } = await supabase
      .from(spec.table)
      .insert({ user_id: currentUserId, friend_id: person.id });
    setPending(null);
    if (error) {
      toast(`Couldn't add to your ${kind}.`, "error");
      return;
    }
    setRows((prev) => [person, ...prev]);
    // The feeds read this list on the server, so they need to know.
    router.refresh();
  }

  async function remove(person: CirclePerson) {
    if (pending) return;
    setPending(person.id);
    haptics.select();
    const { error } = await supabase
      .from(spec.table)
      .delete()
      .eq("user_id", currentUserId)
      .eq("friend_id", person.id);
    setPending(null);
    if (error) {
      toast(`Couldn't remove from your ${kind}.`, "error");
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== person.id));
    router.refresh();
    // Undo re-inserts rather than deferring the delete, because here that
    // genuinely restores the same state — nothing is destroyed by removing
    // someone from a private list.
    toast(`Removed ${person.name}`, "plain", {
      label: "Undo",
      onClick: () => void add(person),
    });
  }

  const Icon = spec.icon;
  const unlisted = (suggestions ?? []).filter((p) => !inList.has(p.id));

  return (
    <div className="flex flex-col">
      <p className="px-4 pb-3 pt-3 text-xs leading-relaxed text-muted">{spec.blurb}</p>

      {rows.length === 0 ? (
        <EmptyState
          icon={Icon}
          title={kind === "hypers" ? "No Hypers yet" : "No Favourites yet"}
          text={`Pick a few below, or use the ··· menu on anyone's profile to ${spec.verb.toLowerCase()} them.`}
          variant="compact"
        />
      ) : (
        <div className="flex flex-col divide-y divide-border/50 border-y border-border/50">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-3">
              <Link
                href={r.username ? `/u/${r.username}` : "#"}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <Avatar name={r.name} hue={r.hue} src={r.avatarUrl ?? undefined} size={44} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{r.name}</span>
                  {r.username && (
                    <span className="block truncate text-xs text-muted">@{r.username}</span>
                  )}
                </span>
              </Link>
              <button
                type="button"
                onClick={() => void remove(r)}
                disabled={pending === r.id}
                aria-label={`Remove ${r.name}`}
                className="flex h-9 items-center gap-1 rounded-pill border border-border px-3 text-xs font-bold text-muted transition-colors hover:text-foreground disabled:opacity-60"
              >
                <X size={14} /> Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {unlisted.length > 0 && (
        <>
          <h2 className="px-4 pb-2 pt-6 text-xs font-bold uppercase tracking-wide text-faint">
            Suggested
          </h2>
          <div className="flex flex-col divide-y divide-border/50 border-y border-border/50">
            {unlisted.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                <Link
                  href={p.username ? `/u/${p.username}` : "#"}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <Avatar name={p.name} hue={p.hue} src={p.avatarUrl ?? undefined} size={40} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{p.name}</span>
                    {p.username && (
                      <span className="block truncate text-xs text-muted">@{p.username}</span>
                    )}
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => void add(p)}
                  disabled={pending === p.id}
                  className="flex h-9 items-center gap-1 rounded-pill bg-accent px-3 text-xs font-bold text-accent-ink transition-transform active:scale-95 disabled:opacity-60"
                >
                  {pending === p.id ? <Check size={14} /> : <Plus size={14} />} Add
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="h-8" />
    </div>
  );
}
