"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { barWidth, voteLabel } from "@/lib/chat-poll";
import type { Look } from "@/lib/show-looks";
import type { PollPayload, QuestionPayload } from "@/lib/show-layers";
import { onInk } from "@/lib/show-stickers";

/** What the server knows about one poll on this Show. */
export type PollState = { tally: number[]; voters: number; mine: number | null };

/**
 * A poll on a Show, answered.
 *
 * The counting rules are chat's, imported rather than rewritten:
 * `barWidth` measures each bar against the leader and not the total,
 * because on a poll where the counts can outrun the number of people a
 * bar against the total shrinks as more vote, which reads as the option
 * losing ground.
 *
 * Counts stay hidden until you answer — showing them first turns a
 * question into a bandwagon, which is the rule PollBubble already
 * follows.
 *
 * The tick is optimistic; the counts are not. A vote appears chosen
 * straight away because that is a fact about your own tap, but the
 * numbers are whatever the server returns.
 */
export function ShowPoll({
  showId,
  layerId,
  poll,
  look,
  state,
}: {
  showId: string;
  layerId: string;
  poll: PollPayload;
  look: Look;
  state?: PollState;
}) {
  const [supabase] = useState(createClient);
  const [mine, setMine] = useState<number | null>(state?.mine ?? null);
  const [tally, setTally] = useState<number[]>(
    state?.tally?.length === poll.options.length ? state.tally : poll.options.map(() => 0),
  );
  const [voters, setVoters] = useState(state?.voters ?? 0);
  const [busy, setBusy] = useState(false);

  const answered = mine !== null;

  async function choose(index: number) {
    if (busy) return;
    setBusy(true);
    const was = mine;
    // Tapping the one you already chose takes it back, which is what a
    // second tap plainly means and what the chat poll does.
    setMine(was === index ? null : index);

    const { data, error } = await supabase.rpc("cast_show_vote", {
      p_show_id: showId,
      p_layer_id: layerId,
      p_choice: index,
    });
    setBusy(false);

    if (error) {
      setMine(was);
      return;
    }
    const next = data as { tally?: number[]; voters?: number } | null;
    if (Array.isArray(next?.tally)) setTally(next.tally);
    if (typeof next?.voters === "number") setVoters(next.voters);
  }

  return (
    <span style={{ ...look.box, display: "flex", flexDirection: "column", gap: 7, width: 230 }}>
      <span style={{ ...look.title, fontSize: 12.5 }}>{poll.question}</span>
      {poll.options.map((option, i) => (
        <button
          key={i}
          type="button"
          disabled={busy}
          onClick={(e) => {
            // The frame underneath moves between Shows on a tap.
            e.stopPropagation();
            void choose(i);
          }}
          style={{
            position: "relative",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: 34,
            padding: "0 12px",
            borderRadius: 11,
            border: `1px solid ${mine === i ? look.ink : `${look.ink}40`}`,
            background: "transparent",
            fontFamily: "inherit",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            ...look.title,
          }}
        >
          {answered && (
            <span
              aria-hidden
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: `${barWidth(tally, i)}%`,
                background: `${look.ink}3d`,
                transition: "width 300ms ease",
              }}
            />
          )}
          <span style={{ position: "relative" }}>{option}</span>
          {answered && (
            <span style={{ position: "relative", fontSize: 11, fontWeight: 800 }}>{tally[i] ?? 0}</span>
          )}
        </button>
      ))}
      <span
        style={{
          ...look.sub,
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        {answered ? voteLabel(voters) : "Tap to answer"}
      </span>
    </span>
  );
}

/**
 * The question box.
 *
 * The answer goes to the author and to nobody else — not to the thread,
 * not to a list anybody can read. That is the whole promise of the box,
 * and it is the RLS policy on show_answers rather than a convention.
 */
export function ShowQuestion({
  showId,
  layerId,
  question,
  look,
}: {
  showId: string;
  layerId: string;
  question: QuestionPayload;
  look: Look;
}) {
  const [supabase] = useState(createClient);
  const [body, setBody] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function send() {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    const { error } = await supabase.rpc("answer_show_question", {
      p_show_id: showId,
      p_layer_id: layerId,
      p_body: text,
    });
    setBusy(false);
    if (error) return;
    setSent(true);
    setBody("");
  }

  return (
    <span style={{ ...look.box, display: "flex", flexDirection: "column", gap: 10, width: 230 }}>
      <span style={{ ...look.title, fontSize: 12.5 }}>{question.prompt}</span>
      {sent ? (
        <span style={{ ...look.sub, fontSize: 12, paddingBlock: 9 }}>Sent — only they see it.</span>
      ) : (
        <span style={{ display: "flex", gap: 6 }}>
          <input
            value={body}
            maxLength={300}
            onChange={(e) => setBody(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter") void send();
            }}
            placeholder="Type something…"
            aria-label={question.prompt}
            style={{
              flex: 1,
              minWidth: 0,
              height: 36,
              padding: "0 13px",
              borderRadius: 100,
              border: "none",
              background: "rgba(255,255,255,0.1)",
              color: String(look.title.color ?? "#ffffff"),
              fontFamily: "inherit",
              fontSize: 12,
              outline: "none",
            }}
          />
          <button
            type="button"
            disabled={!body.trim() || busy}
            onClick={(e) => {
              e.stopPropagation();
              void send();
            }}
            aria-label="Send"
            style={{
              width: 36,
              height: 36,
              flex: "none",
              borderRadius: "50%",
              border: "none",
              background: look.ink,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: body.trim() ? 1 : 0.45,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={onInk(look.ink)} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M22 2 11 13" />
              <path d="m22 2-7 20-4-9-9-4z" />
            </svg>
          </button>
        </span>
      )}
    </span>
  );
}
