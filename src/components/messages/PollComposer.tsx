"use client";

import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import {
  MAX_POLL_OPTION,
  MAX_POLL_OPTIONS,
  MAX_POLL_QUESTION,
  MIN_POLL_OPTIONS,
  pollReady,
  tidyOptions,
} from "@/lib/chat-poll";
import { countdownReady, promptReady, quizReady, rulePromise, type ChatStickerKind } from "@hypefy/core/chat-stickers";
import { MAX_STICKER_LINE } from "@hypefy/core/show-layers";

/**
 * Writing a poll, or one of the interactive stickers ported from Shows
 * (0221): a quiz, a hype slider, a question or a countdown.
 *
 * One sheet behind the attach menu's one entry rather than five entries,
 * because they are one idea — ask the chat something — and the attach menu
 * is going from seven entries to six (design D6 C), not to eleven.
 *
 * Two empty options to start with, because that is the fewest a poll can
 * have and starting at one would make the first thing you do adding a row.
 */

export type StickerDraft =
  | { kind: "quiz"; text: string; options: string[]; answer: number }
  | { kind: "slider" | "question"; text: string }
  | { kind: "countdown"; text: string; at: string };

type Kind = "poll" | ChatStickerKind;

const KINDS: { kind: Kind; label: string; placeholder: string }[] = [
  { kind: "poll", label: "Poll", placeholder: "Ask something…" },
  { kind: "quiz", label: "Quiz", placeholder: "Ask a question with one right answer…" },
  { kind: "slider", label: "Hype slider", placeholder: "How hyped are you for…" },
  { kind: "question", label: "Question", placeholder: "Ask them anything…" },
  { kind: "countdown", label: "Countdown", placeholder: "What are you counting down to?" },
];

/** A datetime-local value an hour from now, in the viewer's own time. */
function inAnHour(): string {
  const d = new Date(Date.now() + 3_600_000);
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function PollComposer({
  open,
  onClose,
  onSend,
  onSendSticker,
}: {
  open: boolean;
  onClose: () => void;
  onSend: (question: string, options: string[], multi: boolean) => void;
  onSendSticker: (draft: StickerDraft) => void;
}) {
  const [kind, setKind] = useState<Kind>("poll");
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [multi, setMulti] = useState(false);
  const [answer, setAnswer] = useState<number | null>(null);
  const [at, setAt] = useState(inAnHour);

  function reset() {
    setKind("poll");
    setQuestion("");
    setOptions(["", ""]);
    setMulti(false);
    setAnswer(null);
    setAt(inAnHour());
  }

  function setOption(i: number, value: string) {
    setOptions((prev) => prev.map((o, at) => (at === i ? value : o)));
  }

  const ready = pollReady(question, options);
  // datetime-local has no zone; Date reads it as the viewer's local time,
  // which is the time they picked.
  const atIso = Number.isNaN(Date.parse(at)) ? "" : new Date(at).toISOString();
  const canSend =
    kind === "poll"
      ? ready
      : kind === "quiz"
        ? quizReady(question, options, answer)
        : kind === "countdown"
          ? countdownReady(question, atIso)
          : promptReady(question);
  const hasOptions = kind === "poll" || kind === "quiz";

  function send() {
    const text = question.trim();
    if (kind === "poll") {
      // Sent exactly as it will be kept, so what arrives in the thread is
      // what the sheet was showing.
      onSend(question.trim(), tidyOptions(options), multi);
    } else if (kind === "quiz") {
      // Not tidied: the answer is an index, and the server refuses rather
      // than drops, so this sends what quizReady approved.
      onSendSticker({ kind, text, options: options.map((o) => o.trim()), answer: answer! });
    } else if (kind === "countdown") {
      onSendSticker({ kind, text, at: atIso });
    } else {
      onSendSticker({ kind, text });
    }
    onClose();
    reset();
  }

  const meta = KINDS.find((k) => k.kind === kind)!;

  return (
    <BottomSheet
      open={open}
      onClose={() => {
        onClose();
        reset();
      }}
      title={kind === "poll" ? "New poll" : `New ${meta.label.toLowerCase()}`}
      footer={
        <div className="flex flex-col gap-2 border-t border-border bg-elevated px-4 py-3">
          {/* The rule, before you send: the same line the card will carry. */}
          <p className="text-[11px] font-semibold text-faint">{rulePromise(kind)}</p>
          <div className="flex items-center gap-2">
            {kind === "poll" && (
              <button
                type="button"
                onClick={() => setMulti((m) => !m)}
                aria-pressed={multi}
                className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold transition active:scale-95 ${
                  multi ? "bg-accent text-accent-ink" : "bg-surface text-muted"
                }`}
              >
                Pick any
              </button>
            )}
            <button
              type="button"
              disabled={!canSend}
              onClick={send}
              className="flex-1 rounded-xl bg-accent px-3 py-2 text-sm font-bold text-accent-ink transition active:scale-95 disabled:opacity-40"
            >
              Send {meta.label.toLowerCase()}
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3 px-4 pb-4">
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]" role="tablist" aria-label="What to ask">
          {KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              role="tab"
              aria-selected={kind === k.kind}
              onClick={() => setKind(k.kind)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition active:scale-95 ${
                kind === k.kind ? "bg-accent text-accent-ink" : "bg-surface text-muted"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>

        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={kind === "countdown" ? MAX_STICKER_LINE : MAX_POLL_QUESTION}
          placeholder={meta.placeholder}
          className="h-11 w-full rounded-2xl bg-surface px-4 text-sm outline-none placeholder:text-faint"
        />

        {kind === "countdown" && (
          <label className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-2.5 text-sm">
            <span className="text-muted">Ends</span>
            <input
              type="datetime-local"
              value={at}
              onChange={(e) => setAt(e.target.value)}
              className="bg-transparent text-right text-sm text-foreground outline-none [color-scheme:dark]"
            />
          </label>
        )}

        {hasOptions && (
          <div className="flex flex-col gap-2">
            {kind === "quiz" && <p className="text-[11px] font-semibold text-faint">Tap the circle by the right answer.</p>}
            {options.map((option, i) => (
              <div key={i} className="flex items-center gap-2">
                {kind === "quiz" && (
                  <button
                    type="button"
                    onClick={() => setAnswer(i)}
                    aria-pressed={answer === i}
                    aria-label={`Option ${i + 1} is the right answer`}
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition ${
                      answer === i ? "border-accent bg-accent text-accent-ink" : "border-border"
                    }`}
                  >
                    {answer === i && <Check size={13} strokeWidth={3} aria-hidden />}
                  </button>
                )}
                <input
                  value={option}
                  onChange={(e) => setOption(i, e.target.value)}
                  maxLength={MAX_POLL_OPTION}
                  placeholder={`Option ${i + 1}`}
                  className="h-10 min-w-0 flex-1 rounded-xl bg-surface px-3 text-sm outline-none placeholder:text-faint"
                />
                {/* Removable only down to the minimum: a poll with one option
                    is not a poll, and the button would be offering a state the
                    Send button then refuses. */}
                {options.length > MIN_POLL_OPTIONS && (
                  <button
                    type="button"
                    onClick={() => {
                      setOptions((prev) => prev.filter((_, at) => at !== i));
                      // The right answer is an index: removing a row above it
                      // moves it, removing it clears it.
                      setAnswer((a) => (a === null || a === i ? null : a > i ? a - 1 : a));
                    }}
                    aria-label={`Remove option ${i + 1}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/5 hover:text-foreground"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {hasOptions && options.length < MAX_POLL_OPTIONS && (
          <button
            type="button"
            onClick={() => setOptions((prev) => [...prev, ""])}
            className="flex items-center gap-1.5 self-start rounded-xl px-2 py-1.5 text-[13px] font-bold text-accent transition active:scale-95"
          >
            <Plus size={15} strokeWidth={2.6} aria-hidden />
            Add option
          </button>
        )}
      </div>
    </BottomSheet>
  );
}
