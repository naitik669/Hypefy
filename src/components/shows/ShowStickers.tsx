"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { voteLabel } from "@/lib/chat-poll";
import type { Look } from "@/lib/show-looks";
import type { AddYoursPayload, CountdownPayload, QuizPayload, ShowLayer, SliderPayload } from "@/lib/show-layers";
import { countdownParts, onInk, quizMark, revealed, seeded, stickerError, type Seeded } from "@/lib/show-stickers";
import type { PollState } from "@/components/shows/ShowPoll";
import { Celebrate } from "@/components/shows/Celebrate";
import { carryLayer } from "@/lib/show-carry";

/**
 * The four stickers that do something: Quiz, Hype slider, Countdown and
 * Add yours. Each draws inert with `preview` (the editor, a ring preview)
 * and live otherwise. Every tap stops at the sticker, because the frame
 * underneath moves between Shows on a tap.
 */

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/**
 * The brand's lime, for the one mark on a sticker that speaks for everybody
 * rather than for the person looking at it — the hype slider's average. Every
 * other colour on a sticker comes from its look; this one must not, or it
 * changes meaning as the look changes. Same value as show-looks.ts's LIME.
 */
const HYPE_LIME = "#a3e635";

/**
 * How many seconds a finished countdown walks down before the party, and how
 * long each one takes. Short: it is a flourish on the way to "It's happening",
 * not a second countdown.
 */
const RUN_FROM = 3;
const RUN_STEP_MS = 420;

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
  isAuthor = false,
  preview = false,
}: {
  showId?: string;
  layerId: string;
  quiz: QuizPayload;
  look: Look;
  state?: PollState;
  /** Your own quiz shows you the answer and the count, and takes no guess. */
  isAuthor?: boolean;
  preview?: boolean;
}) {
  const [supabase] = useState(createClient);

  // Seeded rather than remounted when the server's answer arrives; see
  // `seeded`, and ShowPoll for the same shape.
  const seed = useMemo<{ mine: number | null; voters: number }>(
    () => ({ mine: state?.mine ?? null, voters: state?.voters ?? 0 }),
    [state],
  );
  const [held, setHeld] = useState<Seeded<{ mine: number | null; voters: number }>>(() => ({ value: seed, seed }));
  // State, not a ref — it is read during render. See ShowPoll.
  const [touched, setTouched] = useState(false);
  const next = seeded(held, seed, touched);
  if (next !== held) setHeld(next);

  const { mine, voters } = next.value;
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function choose(i: number) {
    if (preview || !showId || busy || mine !== null || isAuthor) return;
    setBusy(true);
    setProblem(null);
    setTouched(true);
    setHeld({ value: { mine: i, voters }, seed: next.seed });
    const { data, error } = await supabase.rpc("cast_show_vote", { p_show_id: showId, p_layer_id: layerId, p_choice: i });
    setBusy(false);
    if (error) {
      setHeld({ value: { mine: null, voters }, seed: next.seed });
      setProblem(stickerError(error));
      return;
    }
    const answer = data as { voters?: number } | null;
    setHeld({ value: { mine: i, voters: typeof answer?.voters === "number" ? answer.voters : voters }, seed: next.seed });
  }

  return (
    <span style={{ ...look.box, display: "flex", flexDirection: "column", gap: 7, width: 230 }}>
      <span style={{ ...look.title, fontSize: 12.5 }}>{quiz.question}</span>
      {quiz.options.map((option, i) => {
        // The author never guessed, so there is no "your answer" to mark —
        // they are shown which one is right, and nothing else.
        const mark = isAuthor ? (i === quiz.answer ? "right" : null) : quizMark(i, quiz.answer, mine);
        return (
          <Press
          preview={preview}
            key={i}
            disabled={preview || busy || mine !== null || isAuthor}
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
              cursor: preview || isAuthor ? "default" : "pointer",
              ...look.title,
              ...(mark ? { color: "#ffffff" } : {}),
            }}
          >
            <span>{option}</span>
            {mark && <span aria-label={mark === "right" ? "Right answer" : "Your answer, wrong"}>{mark === "right" ? "✓" : "✕"}</span>}
          </Press>
        );
      })}
      <span style={label(look)}>
        {problem ?? (revealed(isAuthor, mine) ? voteLabel(voters) : "Quiz · tap to answer")}
      </span>
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

  /** What is drawn: where the ★ sits, and the average once the server has it. */
  type Hype = { pick: number; sent: { avg: number; count: number } | null };
  const seed = useMemo<Hype>(
    () => ({
      pick: state?.mine ?? (isAuthor ? state?.avg ?? 0 : 50),
      sent: state && (state.mine !== null || isAuthor) ? { avg: state.avg, count: state.count } : null,
    }),
    [state, isAuthor],
  );
  const [held, setHeld] = useState<Seeded<Hype>>(() => ({ value: seed, seed }));
  // State, not a ref — it is read during render. See ShowPoll.
  const [touched, setTouched] = useState(false);
  const next = seeded(held, seed, touched);
  if (next !== held) setHeld(next);
  const { pick: value, sent } = next.value;

  const [who, setWho] = useState<{ name: string; value: number }[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /** True from letting go until it has settled, so only then does it spring. */
  const [settling, setSettling] = useState(false);
  const track = useRef<HTMLSpanElement | null>(null);
  const live = !preview && !!showId && !isAuthor;

  function put(pick: number, s: Hype["sent"] = sent) {
    setTouched(true);
    setHeld({ value: { pick, sent: s }, seed: next.seed });
  }

  function at(clientX: number) {
    const r = track.current?.getBoundingClientRect();
    if (!r || r.width <= 0) return value;
    return Math.round(Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * 100);
  }

  async function send(v: number) {
    if (!live || !showId) return;
    const was = value;
    setProblem(null);
    const { data, error } = await supabase.rpc("set_show_slider", { p_show_id: showId, p_layer_id: layerId, p_value: v });
    if (error) {
      // It used to leave the ★ wherever the thumb let go, recording nothing
      // and saying nothing — the worst of the three options.
      put(was === v ? seed.pick : was);
      setProblem(stickerError(error));
      return;
    }
    const d = data as { avg?: number; count?: number } | null;
    put(v, { avg: Number(d?.avg) || 0, count: Number(d?.count) || 0 });
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
          setSettling(false);
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          put(at(e.clientX));
        }}
        onPointerMove={(e) => {
          if (!live || !(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return;
          put(at(e.clientX));
        }}
        onPointerUp={(e) => {
          if (!live) return;
          const v = at(e.clientX);
          // Let go and it springs home to where it was left, rather than
          // stopping dead under the thumb.
          setSettling(true);
          put(v);
          void send(v);
        }}
        onKeyDown={(e) => {
          if (!live || (e.key !== "ArrowRight" && e.key !== "ArrowLeft")) return;
          const v = Math.min(100, Math.max(0, value + (e.key === "ArrowRight" ? 10 : -10)));
          setSettling(true);
          put(v);
          void send(v);
        }}
        style={{ position: "relative", height: 10, borderRadius: 5, background: `${look.ink}33`, touchAction: "none", cursor: live ? "pointer" : "default" }}
      >
        <span
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${value}%`,
            borderRadius: 5,
            background: look.ink,
            transition: settling ? "width 420ms cubic-bezier(.34,1.56,.64,1)" : undefined,
          }}
        />
        {sent && (
          /*
           * Where everyone else landed, in the brand's lime rather than the
           * look's own text colour: it is the one mark on the sticker that is
           * about everybody instead of you, and on half the looks a white tick
           * at 0.7 opacity was invisible against the fill. Drawn for the
           * author too — it is the only number their own slider has.
           */
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: -5,
              bottom: -5,
              left: `${sent.avg}%`,
              width: 2,
              borderRadius: 2,
              background: HYPE_LIME,
              boxShadow: `0 0 8px ${HYPE_LIME}cc`,
            }}
          />
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
            // Overshoots a little and comes back, so letting go feels like
            // landing rather than stopping. Only after release: during the
            // drag the ★ must sit exactly under the thumb.
            transition: settling ? "left 420ms cubic-bezier(.34,1.56,.64,1)" : undefined,
          }}
          onTransitionEnd={() => setSettling(false)}
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
        <span style={label(look)}>
          {problem ?? (sent ? `${sent.count} hyped · avg ${sent.avg}%` : "Drag the ★")}
        </span>
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

  /*
   * A finished countdown runs its last seconds out and then the Show throws
   * a party, rather than quietly reading "It's happening".
   *
   * It is a replay, not a live tick: the moment may have passed days ago, so
   * the numbers start at RUN_FROM and walk down once, the first time somebody
   * opens the Show with it on. Only live — in the tray and in the editor a
   * finished countdown is a shape being arranged, and confetti over the
   * picture you are decorating would be absurd.
   */
  const live = !preview && !!showId;
  const [runOut, setRunOut] = useState(left.ended && live ? RUN_FROM : 0);

  useEffect(() => {
    if (!left.ended || !live || runOut <= 0) return;
    const t = setTimeout(() => setRunOut((n) => n - 1), RUN_STEP_MS);
    return () => clearTimeout(t);
  }, [left.ended, live, runOut]);

  // Derived, not stored: the party is simply "finished, and the seconds have
  // run out". Keeping it in state meant setting it from inside the effect
  // that counts down, which is a cascading render for something already known.
  const partied = left.ended && live && runOut <= 0;
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
        runOut > 0 ? (
          // The last seconds, walking down.
          <span style={{ display: "flex", justifyContent: "center", gap: 8 }}>
            {cell(0, "DAYS")}
            {cell(0, "HRS")}
            {cell(runOut, "SEC")}
          </span>
        ) : (
          <span style={{ ...look.title, fontSize: 15, textAlign: "center" }}>It&rsquo;s happening</span>
        )
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
      {partied && <Celebrate />}
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
  layer,
}: {
  showId?: string;
  layerId: string;
  addYours: AddYoursPayload;
  look: Look;
  added?: number;
  isAuthor?: boolean;
  preview?: boolean;
  /**
   * The whole layer, so answering carries the sticker across in the place it
   * was. The payload alone cannot: the position, angle and look are what make
   * the answer read as part of the same thread.
   */
  layer?: ShowLayer;
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
    // Stashed under the collab the server just gave us, for the editor on
    // the other side of this navigation to pick up. See lib/show-carry.
    if (layer) carryLayer(String(data), layer);
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
