"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { haptics } from "@/lib/haptics";

export type Poll = { options: string[] };

/** Parse a posts.poll jsonb defensively — bad shapes become null. */
export function parsePoll(raw: unknown): Poll | null {
  if (!raw || typeof raw !== "object") return null;
  const opts = (raw as Record<string, unknown>).options;
  if (!Array.isArray(opts)) return null;
  const options = opts.map((o) => String(o)).filter((o) => o.trim().length > 0).slice(0, 4);
  return options.length >= 2 ? { options } : null;
}

/**
 * Voteable poll under a post caption. Options render as buttons until the
 * viewer votes (or it's their own post) — then result bars with counts.
 * Votes are changeable (tap another option).
 */
export function PollBlock({
  postId,
  poll,
  currentUserId,
  isOwn,
}: {
  postId: string;
  poll: Poll;
  currentUserId: string;
  isOwn: boolean;
}) {
  const supabase = createClient();
  const [counts, setCounts] = useState<number[]>(() => poll.options.map(() => 0));
  const [myVote, setMyVote] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.from("poll_votes").select("voter_id, option_idx").eq("post_id", postId);
      if (!active) return;
      const next = poll.options.map(() => 0);
      let mine: number | null = null;
      (data ?? []).forEach((v: any) => {
        if (v.option_idx >= 0 && v.option_idx < next.length) next[v.option_idx] += 1;
        if (v.voter_id === currentUserId) mine = v.option_idx;
      });
      setCounts(next);
      setMyVote(mine);
      setLoaded(true);
    })();
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  async function vote(idx: number) {
    if (busy || !currentUserId || idx === myVote) return;
    haptics.select();
    setBusy(true);
    const prevVote = myVote;
    const prevCounts = counts;
    setCounts((c) => c.map((n, i) => n + (i === idx ? 1 : 0) - (i === prevVote ? 1 : 0)));
    setMyVote(idx);
    const { error } = await supabase
      .from("poll_votes")
      .upsert({ post_id: postId, voter_id: currentUserId, option_idx: idx }, { onConflict: "post_id,voter_id" });
    setBusy(false);
    if (error) { setCounts(prevCounts); setMyVote(prevVote); }
  }

  const total = counts.reduce((a, b) => a + b, 0);
  const showResults = isOwn || myVote !== null;

  return (
    <div className="flex flex-col gap-1.5 px-4 pt-2">
      {poll.options.map((opt, i) => {
        const pct = total > 0 ? Math.round((counts[i] / total) * 100) : 0;
        const chosen = myVote === i;
        return showResults ? (
          <button
            key={i}
            type="button"
            onClick={() => !isOwn && vote(i)}
            disabled={busy || isOwn}
            className="relative flex h-9 w-full items-center overflow-hidden rounded-xl border border-border bg-surface text-left"
          >
            {/* Result fill */}
            <span
              aria-hidden
              className={`absolute inset-y-0 left-0 transition-[width] duration-500 ease-out ${chosen ? "bg-accent/25" : "bg-white/[0.06]"}`}
              style={{ width: loaded ? `${pct}%` : 0 }}
            />
            <span className="relative flex min-w-0 flex-1 items-center gap-1.5 px-3 text-[13px] font-semibold">
              <span className="truncate">{opt}</span>
              {chosen && <Check size={13} className="shrink-0 text-accent" />}
            </span>
            <span className="relative shrink-0 px-3 text-xs font-bold tabular-nums text-muted">{pct}%</span>
          </button>
        ) : (
          <button
            key={i}
            type="button"
            onClick={() => vote(i)}
            disabled={busy || !loaded}
            className="flex h-9 w-full items-center rounded-xl border border-border bg-surface px-3 text-left text-[13px] font-semibold transition-colors hover:border-accent/50 disabled:opacity-60"
          >
            <span className="truncate">{opt}</span>
          </button>
        );
      })}
      <p className="px-1 text-[11px] text-faint">
        {total} {total === 1 ? "vote" : "votes"}
        {!showResults && " · tap to vote"}
      </p>
    </div>
  );
}
