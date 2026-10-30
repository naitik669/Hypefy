"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { voteLabel } from "@/lib/chat-poll";
import type { Look } from "@/lib/show-looks";
import type { AddYoursPayload, CountdownPayload, QuizPayload, SliderPayload } from "@/lib/show-layers";
import { countdownParts, onInk, quizMark } from "@/lib/show-stickers";
import type { PollState } from "@/components/shows/ShowPoll";

/**
 * The four stickers that do something: Quiz, Hype slider, Countdown and
 * Add yours. Each draws inert with `preview` (the editor, a ring preview)
 * and live otherwise. Every tap stops at the sticker, because the frame
 * underneath moves between Shows on a tap.
 */

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/**
 * A button, or in preview just its shape. A preview sits inside the tray's
 * own tile button, and a button inside a button is not a page a browser
 * will build the way it was written.
 */
function Press({
  preview,
  ...props
}: { preview: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  if (preview) {
    const { style, className, children } = props;
    return (
      <span style={{ display: "flex", alignItems: "center", justifyContent: "center", ...style }} className={className}>
        {children}
      </span>
    );
  }
  return <button type="button" {...props} />;
}

const label = (look: Look): React.CSSProperties => ({
  ...look.sub,
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
});

/** A quiz: tap an answer, then see which was right. An answer is final. */
export function ShowQuiz({
  showId,
  layerId,
  quiz,
  look,
  state,
  preview = false,
}: {
  showId?: string;
  layerId: string;
  quiz: QuizPayload;
  look: Look;
  state?: PollState;
  preview?: boolean;
}) {
  const [supabase] = useState(createClient);
  const [mine, setMine] = useState<number | null>(state?.mine ?? null);
  const [voters, setVoters] = useState(state?.voters ?? 0);
  const [busy, setBusy] = useState(false);

  async function choose(i: number) {
    if (preview || !showId || busy || mine !== null) return;
    setBusy(true);
    setMine(i);
    const { data, error } = await supabase.rpc("cast_show_vote", { p_show_id: showId, p_layer_id: layerId, p_choice: i });
    setBusy(false);
    if (error) {
      setMine(null);
      return;
    }
    const next = data as { voters?: number } | null;
    if (typeof next?.voters === "number") setVoters(next.voters);
  }

  return (
    <span style={{ ...look.box, display: "flex", flexDirection: "column", gap: 7, width: 230 }}>
      <span style={{ ...look.title, fontSize: 12.5 }}>{quiz.question}</span>
      {quiz.options.map((option, i) => {
        const mark = quizMark(i, quiz.answer, mine);
        return (
          <Press
          preview={preview}
            key={i}
            disabled={preview || busy || mine !== null}
            onPointerDown={stop}
            onClick={(e) => {
              stop(e);
              void choose(i);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              height: 34,
              padding: "0 12px",
              borderRadius: 11,
              border: mark ? "none" : `1px solid ${look.ink}40`,
              background: mark === "right" ? "#16a34a" : mark === "wrong" ? "#dc2626" : "transparent",
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: 700,
              cursor: preview ? "default" : "pointer",
              ...look.title,
              ...(mark ? { color: "#ffffff" } : {}),
            }}
          >
            <span>{option}</span>
            {mark && <span aria-label={mark === "right" ? "Right answer" : "Your answer, wrong"}>{mark === "right" ? "✓" : "✕"}</span>}
          </Press>
        );
      })}
      <span style={label(look)}>{mine === null ? "Quiz · tap to answer" : voteLabel(voters)}</span>
    </span>
  );
}

/**
 * How hyped are you: drag the ★, let go to send. Slide again to change it.
 * The author cannot slide their own; they see the average and who slid.
 */
export function ShowSlider({
  showId,
  layerId,
  slider,
  look,
  state,
  isAuthor = false,
  preview = false,
}: {
  showId?: string;
  layerId: string;
  slider: SliderPayload;
  look: Look;
  state?: { avg: number; count: number; mine: number | null };
  isAuthor?: boolean;
  preview?: boolean;
}) {
  const [supabase] = useState(createClient);
  const [value, setValue] = useState<number>(state?.mine ?? (isAuthor ? state?.avg ?? 0 : 50));
  const [sent, setSent] = useState<{ avg: number; count: number } | null>(
    state && (state.mine !== null || isAuthor) ? { avg: state.avg, count: state.count } : null,
  );
  const [who, setWho] = useState<{ name: string; value: number }[] | null>(null);
  const track = useRef<HTMLSpanElement | null>(null);
  const live = !preview && !!showId && !isAuthor;

  function at(clientX: number) {
    const r = track.current?.getBoundingClientRect();
    if (!r || r.width <= 0) return value;
    return Math.round(Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * 100);
  }

  async function send(v: number) {
    if (!live || !showId) return;
    const { data, error } = await supabase.rpc("set_show_slider", { p_show_id: showId, p_layer_id: layerId, p_value: v });
    if (error) return;
    const d = data as { avg?: number; count?: number } | null;
    setSent({ avg: Number(d?.avg) || 0, count: Number(d?.count) || 0 });
  }

  async function showWho() {
    if (!showId || who) return;
    const { data } = await supabase.rpc("show_slider_voters", { p_show_id: showId, p_layer_id: layerId });
    setWho(
      (data ?? []).map((r) => ({ name: r.display_name || r.username || "Someone", value: r.value })),
    );
  }

  return (
    <span style={{ ...look.box, display: "flex", flexDirection: "column", gap: 12, width: 230 }}>
      <span style={{ ...look.title, fontSize: 12.5, textAlign: "center" }}>{slider.prompt}</span>
      <span
        ref={track}
        role="slider"
        aria-label={slider.prompt}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        tabIndex={live ? 0 : -1}
        onPointerDown={(e) => {
          stop(e);
          if (!live) return;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          setValue(at(e.clientX));
        }}
        onPointerMove={(e) => {
          if (!live || !(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return;
          setValue(at(e.clientX));
        }}
        onPointerUp={(e) => {
          if (!live) return;
          const v = at(e.clientX);
          setValue(v);
          void send(v);
        }}
        onKeyDown={(e) => {
          if (!live || (e.key !== "ArrowRight" && e.key !== "ArrowLeft")) return;
          const v = Math.min(100, Math.max(0, value + (e.key === "ArrowRight" ? 10 : -10)));
          setValue(v);
          void send(v);
        }}
        style={{ position: "relative", height: 10, borderRadius: 5, background: `${look.ink}33`, touchAction: "none", cursor: live ? "pointer" : "default" }}
      >
        <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${value}%`, borderRadius: 5, background: look.ink }} />
        {sent && !isAuthor && (
          // Where everyone else landed, as a tick on the track.
          <span aria-hidden style={{ position: "absolute", top: -4, bottom: -4, left: `${sent.avg}%`, width: 2, background: String(look.title.color ?? "#fff"), opacity: 0.7 }} />
        )}
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: "50%",
            left: `${value}%`,
            transform: "translate(-50%, -50%)",
            width: 28,
            height: 28,
            borderRadius: 10,
            background: look.ink,
            color: onInk(look.ink),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
            boxShadow: "0 3px 10px rgba(0,0,0,0.3)",
          }}
        >
          ★
        </span>
      </span>
      {isAuthor ? (
        <Press
          preview={preview}
          disabled={preview || !sent?.count}
          onPointerDown={stop}
          onClick={(e) => {
            stop(e);
            void showWho();
          }}
          style={{ ...label(look), background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}
        >
          {sent?.count ? `${sent.count} hyped · avg ${sent.avg}% · see who` : "Hype slider · nobody yet"}
        </Press>
      ) : (
        <span style={label(look)}>{sent ? `${sent.count} hyped · avg ${sent.avg}%` : "Drag the ★"}</span>
      )}
      {who && (
        <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {who.slice(0, 8).map((w, i) => (
            <span key={i} style={{ ...look.title, fontSize: 11.5, fontWeight: 700, display: "flex", justifyContent: "space-between" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.name}</span>
              <span>{w.value}%</span>
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

/** Something coming up, counting down, with Remind me. */
export function ShowCountdown({
  showId,
  layerId,
  countdown,
  look,
  reminded = false,
  isAuthor = false,
  preview = false,
}: {
  showId?: string;
  layerId: string;
  countdown: CountdownPayload;
  look: Look;
  reminded?: boolean;
  isAuthor?: boolean;
  preview?: boolean;
}) {
  const [supabase] = useState(createClient);
  const [now, setNow] = useState(() => Date.now());
  const [on, setOn] = useState(reminded);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const left = countdownParts(countdown.at, now);
  const cell = (n: number, unit: string) => (
    <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <span
        style={{
          ...look.title,
          minWidth: 44,
          height: 40,
          borderRadius: 12,
          background: `${look.ink}26`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 19,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {String(n).padStart(2, "0")}
      </span>
      <span style={{ ...look.sub, fontSize: 9.5, fontWeight: 700 }}>{unit}</span>
    </span>
  );

  async function toggle() {
    if (preview || !showId || busy || isAuthor || left.ended) return;
    setBusy(true);
    const was = on;
    setOn(!was);
    const { data, error } = await supabase.rpc("toggle_countdown_reminder", { p_show_id: showId, p_layer_id: layerId });
    setBusy(false);
    if (error) setOn(was);
    else setOn(Boolean(data));
  }

  return (
    <span style={{ ...look.box, display: "flex", flexDirection: "column", gap: 10, width: 230, alignItems: "stretch" }}>
      <span style={{ ...look.title, fontSize: 13, textAlign: "center" }}>{countdown.title}</span>
      {left.ended ? (
        <span style={{ ...look.title, fontSize: 15, textAlign: "center" }}>It&rsquo;s happening</span>
      ) : (
        <span style={{ display: "flex", justifyContent: "center", gap: 8 }}>
          {cell(left.days, "DAYS")}
          {cell(left.hours, "HRS")}
          {cell(left.minutes, "MIN")}
        </span>
      )}
      {!isAuthor && !left.ended && (
        <Press
          preview={preview}
          disabled={preview || busy}
          onPointerDown={stop}
          onClick={(e) => {
            stop(e);
            void toggle();
          }}
          style={{
            height: 32,
            borderRadius: 11,
            border: "none",
            background: on ? `${look.ink}33` : look.ink,
            color: on ? String(look.title.color ?? "#fff") : onInk(look.ink),
            fontFamily: "inherit",
            fontSize: 12,
            fontWeight: 800,
            cursor: preview ? "default" : "pointer",
          }}
        >
          {on ? "Reminder set ✓" : "Remind me"}
        </Press>
      )}
    </span>
  );
}

/** A prompt others answer with a Show of their own. */
export function ShowAddYours({
  showId,
  layerId,
  addYours,
  look,
  added = 0,
  isAuthor = false,
  preview = false,
}: {
  showId?: string;
  layerId: string;
  addYours: AddYoursPayload;
  look: Look;
  added?: number;
  isAuthor?: boolean;
  preview?: boolean;
}) {
  const [supabase] = useState(createClient);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function go() {
    if (preview || !showId || busy || !addYours.collabId) return;
    if (isAuthor) {
      router.push(`/shows/collab/${addYours.collabId}`);
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc("join_add_yours", { p_show_id: showId, p_layer_id: layerId });
    setBusy(false);
    if (error || !data) {
      setProblem(error?.message.includes("full") ? "This one is full" : "Couldn't open it");
      return;
    }
    router.push(`/create?mode=show&collab=${data}`);
  }

  return (
    <span style={{ ...look.box, display: "flex", flexDirection: "column", gap: 8, width: 210, alignItems: "stretch" }}>
      <span style={{ ...label(look), textAlign: "center", ...look.title, fontSize: 10.5 }}>ADD YOURS</span>
      <span style={{ ...look.title, fontSize: 14, textAlign: "center" }}>{addYours.prompt}</span>
      <Press
          preview={preview}
        disabled={preview || busy}
        onPointerDown={stop}
        onClick={(e) => {
          stop(e);
          void go();
        }}
        style={{
          height: 32,
          borderRadius: 11,
          border: "none",
          background: look.ink,
          color: onInk(look.ink),
          fontFamily: "inherit",
          fontSize: 12,
          fontWeight: 800,
          cursor: preview ? "default" : "pointer",
        }}
      >
        {problem ?? (isAuthor ? "See what people added" : "+ Add yours")}
      </Press>
      {added > 0 && <span style={{ ...label(look), textAlign: "center" }}>{added} added</span>}
    </span>
  );
}
