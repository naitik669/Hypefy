"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";

type Person = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_hue: number | null;
  avatar_url: string | null;
  bio: string | null;
  profile_tags: string[] | null;
};

const GOAL = 3;

export function FollowSuggestions({
  currentUserId,
  people,
}: {
  currentUserId: string;
  people: Person[];
}) {
  const supabase = createClient();
  const toast = useToast();
  const router = useRouter();
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  async function toggleFollow(person: Person) {
    if (pendingId) return;
    const id = person.id;
    const isFollowed = followed.has(id);
    setPendingId(id);
    // Optimistic flip
    setFollowed((prev) => {
      const next = new Set(prev);
      isFollowed ? next.delete(id) : next.add(id);
      return next;
    });

    if (isFollowed) {
      const { error } = await supabase.rpc("unfollow_user", { p_target: id });
      if (error) {
        setFollowed((prev) => new Set(prev).add(id));
        toast("Couldn't update that. Try again.", "error");
      }
    } else {
      const { error } = await supabase.rpc("follow_user", { p_target: id });
      // Of every follow in the app this one matters most: it is the only
      // thing seeding a brand new account's feed.
      if (error) {
        setFollowed((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        toast("Couldn't follow. Try again.", "error");
      }
    }
    setPendingId(null);
  }

  function finish() {
    setLeaving(true);
    router.push("/home");
  }

  const count = followed.size;
  const reachedGoal = count >= GOAL;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-8 pt-10">
      {/* Header */}
      <div className="flex-none">
        <h1 className="text-2xl font-extrabold leading-tight">
          Fuel your feed <span className="text-accent">⚡</span>
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          Follow a few people so your home feed starts loud, not empty.
        </p>

        {/* Progress */}
        <div className="mt-4 flex items-center gap-2.5">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{ width: `${Math.min(count / GOAL, 1) * 100}%` }}
            />
          </div>
          <span className="text-xs font-bold tabular-nums text-muted">
            {Math.min(count, GOAL)}/{GOAL}
          </span>
        </div>
      </div>

      {/* People list */}
      <div className="no-scrollbar mt-5 min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-2 pb-4">
          {people.map((p) => {
            const name = p.display_name ?? p.username ?? "User";
            const isFollowed = followed.has(p.id);
            return (
              <div
                key={p.id}
                className={`flex items-center gap-3 rounded-2xl border px-3 py-3 transition-colors ${
                  isFollowed
                    ? "border-accent/30 bg-accent/[0.05]"
                    : "border-border bg-surface"
                }`}
              >
                <Avatar
                  name={name}
                  hue={p.avatar_hue ?? 280}
                  size={46}
                  src={p.avatar_url ?? undefined}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{name}</p>
                  {p.username && (
                    <p className="truncate text-xs text-muted">@{p.username}</p>
                  )}
                  {p.bio && (
                    <p className="mt-0.5 truncate text-xs text-faint">
                      {p.bio}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => toggleFollow(p)}
                  disabled={pendingId === p.id}
                  className={`flex h-9 min-w-[84px] items-center justify-center gap-1 rounded-xl text-xs font-bold transition-colors disabled:opacity-60 ${
                    isFollowed
                      ? "border border-border bg-elevated text-foreground"
                      : "bg-accent text-accent-ink"
                  }`}
                >
                  {pendingId === p.id ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : isFollowed ? (
                    <>
                      <Check size={13} /> Following
                    </>
                  ) : (
                    "Follow"
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Continue */}
      <div className="flex-none pt-3">
        <button
          type="button"
          onClick={finish}
          disabled={leaving}
          className={`flex h-13 w-full items-center justify-center rounded-xl py-3.5 text-base font-bold transition-colors disabled:opacity-60 ${
            reachedGoal
              ? "bg-accent text-accent-ink"
              : "border border-border bg-surface text-muted"
          }`}
        >
          {leaving ? (
            <Loader2 size={18} className="animate-spin" />
          ) : reachedGoal ? (
            "Let's go ⚡"
          ) : (
            "Skip for now"
          )}
        </button>
      </div>
    </div>
  );
}
