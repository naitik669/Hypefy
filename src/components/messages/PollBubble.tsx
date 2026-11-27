"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { type Poll, barWidth } from "@/lib/chat-poll";
import { readMyChoices } from "@hypefy/core/chat-poll-votes";
import { answeredLabel } from "@hypefy/core/chat-stickers";
import { StickerFace, StickerResultsSheet } from "./ChatStickers";

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
 *
 * Who voted for what is the asker's alone since 0221 (design D5 B: counts
 * for everyone, names for whoever asked). The card says so on its face, and
 * the asker's copy opens the results sheet.
 */
export function PollBubble({
  poll,
  messageId,
  viewerId,
  mine,
  askerName,
  memberCount,
  onError,
}: {
  poll: Poll;
  messageId: string;
  /** The signed-in user. Only their votes are ticked. */
  viewerId: string;
  mine: boolean;
  /** The sender's name as this viewer knows them, for "Only Anup sees who voted". */
  askerName: string;
  /** People in the conversation, the viewer included. */
  memberCount: number;
  onError: (message: string) => void;
}) {
  const supabase = createClient();
  const [chosen, setChosen] = useState<ReadonlySet<number>>(new Set());
  const [busy, setBusy] = useState<number | null>(null);
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    let live = true;
    readMyChoices(supabase, messageId, viewerId)
      .then((mineNow) => {
        if (live) setChosen(mineNow);
      })
      .catch((e: unknown) => {
        if (live) onError(e instanceof Error ? e.message : "Couldn't load your vote");
      });
    return () => {
      live = false;
    };
    // Read once per poll: afterwards this component is the only thing that
    // changes your own choices, and it keeps them itself.
    // onError is left out on purpose: the thread passes a fresh arrow every
    // render, and re-reading the votes on each render would undo a tick made
    // since the last read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageId, viewerId, supabase]);

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
  // The asker sees the counts without voting: it is their question, and the
  // results are the reason they asked (show-stickers.ts, `revealed`).
  const shown = voted || mine;

  return (
    <>
      <StickerFace
        kind="poll"
        question={poll.question}
        mine={mine}
        askerName={askerName}
        onSeeWho={() => setSheet(true)}
        foot={`${poll.multi ? "Pick any · " : ""}${answeredLabel("poll", poll.voters, memberCount)}`}
      >
        <div className="flex flex-col gap-1.5">
          {poll.options.map((option, i) => {
            const ticked = chosen.has(i);
            return (
              <button
                key={`${i}-${option}`}
                type="button"
                onClick={() => choose(i)}
                aria-pressed={ticked}
                className={`relative flex items-center gap-2 overflow-hidden rounded-[13px] border px-2.5 py-2 text-left transition active:scale-[0.98] disabled:opacity-60 ${
                  ticked ? "border-accent/60" : "border-border"
                }`}
                disabled={busy !== null}
              >
                {/* The bar is behind the words, not beside them: a row that is
                    both the control and the result has no room for a track. */}
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 bg-accent/20 transition-[width] duration-300"
                  style={{ width: `${shown ? barWidth(poll.tally, i) : 0}%` }}
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
                {shown && (
                  <span className="relative shrink-0 text-[11px] font-bold tabular-nums text-muted">
                    {poll.tally[i]}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </StickerFace>
      {mine && (
        <StickerResultsSheet
          open={sheet}
          onClose={() => setSheet(false)}
          messageId={messageId}
          title="Who voted · your poll"
          describe={(r) => r.choices.map((c) => poll.options[c] ?? `Option ${c + 1}`).join(", ")}
        />
      )}
    </>
  );
}
