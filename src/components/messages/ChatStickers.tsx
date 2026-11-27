"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Lock, UserRound, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { readMyChoices } from "@hypefy/core/chat-poll-votes";
import { readMyStickerAnswer, readStickerResults, type StickerResult } from "@hypefy/core/chat-sticker-answers";
import {
  MAX_QUESTION_ANSWER,
  answeredLabel,
  percents,
  sliderScore,
  whoSees,
  type ChatCountdown,
  type ChatQuestion,
  type ChatQuiz,
  type ChatSlider,
  type ChatSticker,
  type ChatStickerKind,
} from "@hypefy/core/chat-stickers";
import { countdownParts, quizMark, stickerError } from "@hypefy/core/show-stickers";

/**
 * Interactive stickers in a conversation (design D5 B, "one rule everywhere").
 *
 * Every card has the same three parts: what kind it is, the question, and a
 * line that says who sees your answer. The line is the rule stated where the
 * person is about to act on it — counts for everyone, names only for whoever
 * asked. The asker's own card says so the other way round, and opens the
 * results sheet.
 */

export type StickerCardProps = {
  messageId: string;
  /** The signed-in user. */
  viewerId: string;
  /** Whether the viewer sent it, i.e. asked. */
  mine: boolean;
  /** The sender's name as this viewer knows them. Unused when `mine`. */
  askerName: string;
  /** People in the conversation, the viewer included. */
  memberCount: number;
  onError: (message: string) => void;
};

const KIND_LABEL: Record<"poll" | ChatStickerKind, string> = {
  poll: "Poll",
  quiz: "Quiz",
  slider: "Hype slider",
  question: "Question",
  countdown: "Countdown",
};

/** The shell every interactive card shares, poll included. */
export function StickerFace({
  kind,
  question,
  mine,
  askerName,
  foot,
  onSeeWho,
  children,
}: {
  kind: "poll" | ChatStickerKind;
  question: string;
  mine: boolean;
  askerName: string;
  foot?: string | null;
  /** Opens the results sheet. Only offered to the asker, and never on a countdown. */
  onSeeWho?: () => void;
  children: React.ReactNode;
}) {
  const rule = whoSees(kind, mine ? null : askerName);
  return (
    <div
      className={`flex w-[272px] max-w-full flex-col rounded-[20px] border border-border bg-surface p-3 ${
        mine ? "rounded-br-md" : "rounded-bl-md"
      }`}
    >
      <span className="mx-px mb-2 text-[10px] font-extrabold uppercase tracking-[0.12em] text-faint">
        {KIND_LABEL[kind]}
        {mine && kind !== "countdown" ? " · you asked" : ""}
      </span>
      <p className="mx-px mb-2.5 text-[14.5px] font-extrabold leading-snug text-foreground">{question}</p>
      {children}
      {mine && onSeeWho && kind !== "countdown" ? (
        <button
          type="button"
          onClick={onSeeWho}
          className="mx-px mt-2.5 flex items-center gap-2 rounded-[14px] bg-accent/10 px-2.5 py-2 text-left text-[11.5px] font-bold text-accent transition active:scale-[0.98]"
        >
          <UserRound size={13} aria-hidden />
          {rule}
          <span className="ml-auto underline underline-offset-[3px]">See who</span>
        </button>
      ) : (
        <span className="mx-px mt-2.5 flex items-center gap-1.5 text-[11px] font-bold text-muted">
          <Lock size={12} aria-hidden />
          {rule}
        </span>
      )}
      {foot && <p className="mx-px mt-2 text-[11px] font-semibold text-faint">{foot}</p>}
    </div>
  );
}

/** One of the four kinds 0221 adds. The poll keeps its own component (PollBubble). */
export function ChatStickerCard({ sticker, ...props }: StickerCardProps & { sticker: ChatSticker }) {
  switch (sticker.kind) {
    case "quiz":
      return <QuizCard quiz={sticker} {...props} />;
    case "slider":
      return <SliderCard slider={sticker} {...props} />;
    case "question":
      return <QuestionCard question={sticker} {...props} />;
    case "countdown":
      return <CountdownCard countdown={sticker} {...props} />;
  }
}

// ── Quiz ────────────────────────────────────────────────────────────────

function QuizCard({ quiz, messageId, viewerId, mine, askerName, memberCount, onError }: StickerCardProps & { quiz: ChatQuiz }) {
  const [supabase] = useState(createClient);
  const [answer, setAnswer] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    if (mine) return;
    let live = true;
    readMyChoices(supabase, messageId, viewerId)
      .then((got) => {
        if (live) setAnswer(got.size > 0 ? [...got][0] : null);
      })
      .catch((e: unknown) => {
        if (live) onError(e instanceof Error ? e.message : "Couldn't load your answer");
      });
    return () => {
      live = false;
    };
    // onError is a fresh arrow every render; reading again would undo nothing
    // but would refetch on every message in the thread.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageId, viewerId, mine, supabase]);

  async function choose(i: number) {
    if (mine || answer !== null || busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("answer_dm_quiz", { p_message_id: messageId, p_choice: i });
    setBusy(false);
    const failed = stickerError(error);
    if (failed) {
      onError(failed);
      return;
    }
    // The server's answer, not the tap: a quiz is final, so if one was
    // already recorded from another device that one is what stands.
    const got = (data as { mine?: unknown } | null)?.mine;
    setAnswer(typeof got === "number" ? got : i);
  }

  // The asker sees the counts straight away; everyone else once they have
  // answered, because counts before answering turn a quiz into a copy.
  const shown = mine || answer !== null;
  const pct = percents(quiz.tally, quiz.voters);

  return (
    <>
      <StickerFace
        kind="quiz"
        question={quiz.question}
        mine={mine}
        askerName={askerName}
        onSeeWho={() => setSheet(true)}
        foot={
          !mine && answer === null
            ? "Tap an answer. The counts show once you do."
            : !mine
              ? answer === quiz.answer
                ? "You got it right."
                : "Not that one. The right answer is marked."
              : answeredLabel("quiz", quiz.voters, memberCount)
        }
      >
        <div className="flex flex-col gap-1.5">
          {quiz.options.map((option, i) => {
            const mark = mine ? (i === quiz.answer ? "right" : null) : quizMark(i, quiz.answer, answer);
            return (
              <button
                key={`${i}-${option}`}
                type="button"
                onClick={() => choose(i)}
                disabled={mine || answer !== null || busy}
                aria-pressed={answer === i}
                className={`flex items-center justify-between gap-2 rounded-2xl border-[1.5px] px-3 py-2.5 text-left transition active:scale-[0.98] disabled:active:scale-100 ${
                  mark === "right"
                    ? "border-accent bg-accent/10"
                    : mark === "wrong"
                      ? "border-danger/70 bg-danger/10"
                      : "border-transparent bg-white/[0.04]"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {mark === "right" && <Check size={13} strokeWidth={3} className="shrink-0 text-accent" aria-label="Right answer" />}
                  {mark === "wrong" && <X size={13} strokeWidth={3} className="shrink-0 text-danger" aria-label="Your answer" />}
                  <span className="truncate text-[13px] font-semibold text-foreground">{option}</span>
                </span>
                {shown && (
                  <span className={`shrink-0 text-xs font-extrabold tabular-nums ${mark === "right" ? "text-accent" : "text-muted"}`}>
                    {pct[i]}%
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
          title="Who answered · your quiz"
          describe={(r) => r.choices.map((c) => quiz.options[c] ?? `Option ${c + 1}`).join(", ")}
        />
      )}
    </>
  );
}

// ── Hype slider ─────────────────────────────────────────────────────────

function SliderCard({ slider, messageId, viewerId, mine, askerName, memberCount, onError }: StickerCardProps & { slider: ChatSlider }) {
  const [supabase] = useState(createClient);
  const [value, setValue] = useState(50);
  const [saved, setSaved] = useState<number | null>(null);
  // A ref, not state: the read below compares against it after it lands.
  const touched = useRef(false);
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    if (mine) return;
    let live = true;
    readMyStickerAnswer(supabase, messageId, viewerId)
      .then((got) => {
        if (!live || got?.value == null) return;
        setSaved(got.value);
        // Not over a drag that started before the read came back.
        if (!touched.current) setValue(got.value);
      })
      .catch((e: unknown) => {
        if (live) onError(e instanceof Error ? e.message : "Couldn't load your answer");
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageId, viewerId, mine, supabase]);

  async function commit(v: number) {
    if (mine) return;
    const { error } = await supabase.rpc("set_dm_slider", { p_message_id: messageId, p_value: v });
    const failed = stickerError(error);
    if (failed) {
      // Back to what the server has, rather than leaving the star where it
      // was dragged and recording nothing (show-stickers.ts, stickerError).
      setValue(saved ?? 50);
      onError(failed);
      return;
    }
    setSaved(v);
  }

  // The asker reads the average; everyone else once they have moved it.
  const shown = mine || saved !== null;
  const at = mine ? slider.avg : value;

  return (
    <>
      <StickerFace
        kind="slider"
        question={slider.prompt}
        mine={mine}
        askerName={askerName}
        onSeeWho={() => setSheet(true)}
        foot={
          shown
            ? `Average ${sliderScore(slider.avg)} · ${answeredLabel("slider", slider.count, memberCount)}`
            : "Drag the star and let go."
        }
      >
        <div className="relative mx-px h-8">
          <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-md bg-white/10">
            <span className="block h-full rounded-md bg-accent" style={{ width: `${at}%` }} />
          </div>
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-[22px] leading-none"
            style={{ left: `${at}%` }}
          >
            ★
          </span>
          {!mine && (
            <input
              type="range"
              min={0}
              max={100}
              value={value}
              aria-label={slider.prompt}
              onChange={(e) => {
                touched.current = true;
                setValue(Number(e.target.value));
              }}
              onPointerUp={(e) => void commit(Number((e.target as HTMLInputElement).value))}
              onKeyUp={(e) => void commit(Number((e.target as HTMLInputElement).value))}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          )}
        </div>
        {!mine && saved !== null && <p className="mx-px mt-1 text-[11px] font-semibold text-muted">You said {sliderScore(saved)} of 5.</p>}
      </StickerFace>
      {mine && (
        <StickerResultsSheet
          open={sheet}
          onClose={() => setSheet(false)}
          messageId={messageId}
          title="Who moved it · your slider"
          describe={(r) => (r.value === null ? "" : `${sliderScore(r.value)} of 5`)}
        />
      )}
    </>
  );
}

// ── Question ────────────────────────────────────────────────────────────

function QuestionCard({ question, messageId, viewerId, mine, askerName, memberCount, onError }: StickerCardProps & { question: ChatQuestion }) {
  const [supabase] = useState(createClient);
  const [draft, setDraft] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    if (mine) return;
    let live = true;
    readMyStickerAnswer(supabase, messageId, viewerId)
      .then((got) => {
        if (live && got?.body) setSent(got.body);
      })
      .catch((e: unknown) => {
        if (live) onError(e instanceof Error ? e.message : "Couldn't load your answer");
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageId, viewerId, mine, supabase]);

  async function send() {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    const { error } = await supabase.rpc("answer_dm_question", { p_message_id: messageId, p_body: body });
    setBusy(false);
    const failed = stickerError(error);
    if (failed) {
      // The words stay in the box, so a retry is one tap.
      onError(failed);
      return;
    }
    setSent(body);
    setEditing(false);
    setDraft("");
  }

  const asking = !mine && (sent === null || editing);

  return (
    <>
      <StickerFace
        kind="question"
        question={question.prompt}
        mine={mine}
        askerName={askerName}
        onSeeWho={() => setSheet(true)}
        foot={
          mine
            ? answeredLabel("question", question.count, memberCount)
            : sent !== null && !editing
              ? `Sent to ${askerName}. Nobody else sees it.`
              : null
        }
      >
        {asking ? (
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={MAX_QUESTION_ANSWER}
              rows={2}
              placeholder="Type your answer…"
              aria-label={`Your answer to ${askerName}`}
              className="min-h-[40px] min-w-0 flex-1 resize-none rounded-xl bg-white/[0.04] px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-faint"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={!draft.trim() || busy}
              className="h-9 shrink-0 rounded-xl bg-accent px-3 text-xs font-bold text-accent-ink transition active:scale-95 disabled:opacity-40"
            >
              {busy ? <Loader2 size={14} className="animate-spin" aria-label="Sending" /> : "Send"}
            </button>
          </div>
        ) : !mine && sent !== null ? (
          <button
            type="button"
            onClick={() => {
              setDraft(sent);
              setEditing(true);
            }}
            className="rounded-xl bg-white/[0.04] px-3 py-2 text-left text-[13px] text-foreground"
          >
            {sent}
            <span className="mt-1 block text-[11px] font-bold text-muted">Change your answer</span>
          </button>
        ) : null}
      </StickerFace>
      {mine && (
        <StickerResultsSheet
          open={sheet}
          onClose={() => setSheet(false)}
          messageId={messageId}
          title="Answers · your question"
          longText
          describe={(r) => r.body ?? ""}
        />
      )}
    </>
  );
}

// ── Countdown ───────────────────────────────────────────────────────────

function CountdownCard({ countdown, mine, askerName }: StickerCardProps & { countdown: ChatCountdown }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    // Minutes are the smallest unit drawn, so a tick every 20 s is enough to
    // never be a whole minute behind.
    const t = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(t);
  }, []);
  const left = countdownParts(countdown.at, now);
  const ends = new Date(countdown.at).toLocaleString(undefined, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

  return (
    <StickerFace
      kind="countdown"
      question={countdown.title}
      mine={mine}
      askerName={askerName}
      foot={left.ended ? `Ended ${ends}.` : `Counts down live. Ends ${ends}.`}
    >
      {left.ended ? (
        <p className="mx-px text-[22px] font-extrabold text-accent">It&apos;s here</p>
      ) : (
        <div className="grid grid-cols-3 gap-2" aria-label={`${left.days} days, ${left.hours} hours, ${left.minutes} minutes left`}>
          {[
            [left.days, "days"],
            [left.hours, "hours"],
            [left.minutes, "min"],
          ].map(([n, unit]) => (
            <div key={unit} className="flex flex-col items-center rounded-2xl bg-white/[0.04] py-2">
              <span className="text-[22px] font-extrabold tabular-nums text-foreground">{String(n).padStart(2, "0")}</span>
              <span className="text-[10px] font-bold uppercase tracking-wide text-faint">{unit}</span>
            </div>
          ))}
        </div>
      )}
    </StickerFace>
  );
}

// ── Results, for the asker ──────────────────────────────────────────────

/**
 * Who answered what. The asker's only, and the server holds that line:
 * dm_sticker_results gives anyone else no rows, so this sheet is a view of
 * the rule rather than the rule.
 */
export function StickerResultsSheet({
  open,
  onClose,
  messageId,
  title,
  describe,
  longText = false,
}: {
  open: boolean;
  onClose: () => void;
  messageId: string;
  title: string;
  describe: (r: StickerResult) => string;
  /** A question's answers are sentences, so they get their own line. */
  longText?: boolean;
}) {
  const [supabase] = useState(createClient);
  const [state, setState] = useState<"loading" | "ready" | "unavailable" | "failed">("loading");
  const [people, setPeople] = useState<StickerResult[]>([]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    readStickerResults(supabase, messageId)
      .then((got) => {
        if (!live) return;
        if (got === "unavailable") {
          setState("unavailable");
          return;
        }
        setPeople(got);
        setState("ready");
      })
      .catch(() => {
        if (live) setState("failed");
      });
    return () => {
      live = false;
    };
  }, [open, messageId, supabase]);

  return (
    <BottomSheet
      open={open}
      onClose={() => {
        // Back to "Counting…" for the next open, so it never shows the last
        // open's names while the fresh read is on its way.
        setState("loading");
        onClose();
      }}
      title={title}
      size="half"
    >
      <div className="flex flex-col px-4 pb-4">
        {state === "loading" ? (
          <p className="flex items-center gap-2 py-3 text-xs text-muted">
            <Loader2 size={13} className="animate-spin" aria-hidden /> Counting…
          </p>
        ) : state === "unavailable" ? (
          <p className="rounded-xl bg-surface px-3 py-2.5 text-xs text-muted">
            The counts are on the card. Names appear here after the next database update.
          </p>
        ) : state === "failed" ? (
          <p className="rounded-xl bg-surface px-3 py-2.5 text-xs text-muted">That didn&apos;t load. Close this and try again.</p>
        ) : people.length === 0 ? (
          <p className="py-3 text-xs text-muted">Nobody has answered yet.</p>
        ) : (
          <ul className="flex flex-col">
            {people.map((p) => (
              <li key={p.userId} className={`flex gap-3 py-2 ${longText ? "items-start" : "items-center"}`}>
                <Avatar name={p.name} hue={p.hue} size={36} src={p.avatarUrl ?? undefined} />
                {longText ? (
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-bold">{p.name}</p>
                    <p className="whitespace-pre-wrap break-words text-[13px] text-foreground/90">{describe(p)}</p>
                  </div>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold">{p.name}</span>
                    <span className="shrink-0 text-[11.5px] font-bold text-muted">{describe(p)}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="pt-2 text-[11px] font-semibold text-faint">Only you can open this. Everyone else sees the counts.</p>
      </div>
    </BottomSheet>
  );
}
