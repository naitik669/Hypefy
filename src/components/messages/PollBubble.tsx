"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { type Poll, barWidth, voteLabel } from "@/lib/chat-poll";

/**
 * A poll in the thread.
 *
 * The tally comes down with the message, because cast_poll_vote writes it
 * into the message's metadata and the thread is already listening for
 * message updates — so somebody else's vote lands here through the
 * subscription that was already open, with no channel of its own.
 *
 * Which options are *yours* is the one thing metadata cannot say, since it
 * is the same row for everybody. That is read once from the votes table.
 */
export function PollBubble({
  poll,
  messageId,
  mine,
  onError,
}: {
  poll: Poll;
  messageId: string;
  mine: boolean;
  onError: (message: string) => void;
}) {
  const supabase = createClient();
  const [chosen, setChosen] = useState<ReadonlySet<number>>(new Set());
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const { data } = await supabase
        .from("message_poll_votes")
        .select("choice")
        .eq("message_id", messageId);
      if (!live || !data) return;
      setChosen(new Set(data.map((r) => r.choice)));
    })();
    return () => {
      live = false;
    };
    // Read once per poll: afterwards this component is the only thing that
    // changes your own choices, and it keeps them itself.
  }, [messageId, supabase]);

  async function choose(i: number) {
    if (busy !== null) return;
    setBusy(i);
    // Ticked straight away. The bar waits for the server, because the count
    // is everybody's and guessing at it would show a number that is wrong
    // for a moment in a way nobody can tell from one that is right.
    const had = chosen.has(i);
    setChosen((prev) => {
      const next = new Set(prev);
      if (had) next.delete(i);
      else {
        if (!poll.multi) next.clear();
        next.add(i);
      }
      return next;
    });
    const { error } = await supabase.rpc("cast_poll_vote", {
      p_message_id: messageId,
      p_choice: i,
    });
    setBusy(null);
    if (error) {
      // Put back exactly what was there, rather than inverting again: two
      // failures in a row would otherwise leave the tick inverted twice.
      setChosen((prev) => {
        const next = new Set(prev);
        if (had) next.add(i);
        else next.delete(i);
        return next;
      });
      onError(error.message);
    }
  }

  const voted = chosen.size > 0;

  return (
    <div
      className={`flex w-[250px] flex-col gap-2 rounded-2xl px-3.5 py-3 ${
        mine ? "bg-accent/15" : "bg-surface"
      }`}
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-[14px] font-bold leading-snug text-foreground">{poll.question}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-faint">
          {poll.multi ? "Pick any · " : ""}
          {voteLabel(poll.voters)}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        {poll.options.map((option, i) => {
          const ticked = chosen.has(i);
          return (
            <button
              key={`${i}-${option}`}
              type="button"
              onClick={() => choose(i)}
              aria-pressed={ticked}
              className="relative flex items-center gap-2 overflow-hidden rounded-xl border border-border px-2.5 py-2 text-left transition active:scale-[0.98] disabled:opacity-60"
              disabled={busy !== null}
            >
              {/* The bar is behind the words, not beside them: a row that is
                  both the control and the result has no room for a track. */}
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 bg-accent/20 transition-[width] duration-300"
                style={{ width: `${voted ? barWidth(poll.tally, i) : 0}%` }}
              />
              <span
                className={`relative flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                  ticked ? "border-accent bg-accent text-accent-ink" : "border-border"
                }`}
              >
                {ticked && <Check size={11} strokeWidth={3.2} aria-hidden />}
              </span>
              <span className="relative min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                {option}
              </span>
              {/* Counts appear once you have voted. Showing them first turns
                  a question into a bandwagon. */}
              {voted && (
                <span className="relative shrink-0 text-[11px] font-bold tabular-nums text-muted">
                  {poll.tally[i]}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
