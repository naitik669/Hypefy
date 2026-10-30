"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { describeParts } from "@/lib/schedule-send";
import { CountdownWhen } from "@/components/shows/CountdownWhen";
import { lookFor } from "@/lib/show-looks";
import {
  MAX_POLL_OPTION,
  MAX_POLL_OPTIONS,
  MAX_POLL_QUESTION,
  MIN_POLL_OPTIONS,
  tidyOptions,
} from "@/lib/chat-poll";
import {
  MAX_STICKER_LINE,
  type AddYoursPayload,
  type CountdownPayload,
  type PollPayload,
  type QuestionPayload,
  type QuizPayload,
  type ShowLayer,
  type SliderPayload,
} from "@/lib/show-layers";

/** The layers written on the sticker itself rather than in a sheet. */
export const CARD_TYPES = ["poll", "question", "quiz", "slider", "countdown", "addyours"] as const;
export type CardType = (typeof CARD_TYPES)[number];
export type CardLayer = ShowLayer & { type: CardType };
type CardPayload = PollPayload | QuestionPayload | QuizPayload | SliderPayload | CountdownPayload | AddYoursPayload;

export function isCardType(type: string): type is CardType {
  return (CARD_TYPES as readonly string[]).includes(type);
}

export function isCard(layer: ShowLayer | null): layer is CardLayer {
  return !!layer && (CARD_TYPES as readonly string[]).includes(layer.type);
}

/** What each card starts as when it is placed: blank, to be written on. */
export function blankCard(type: CardType, now = Date.now()): CardPayload {
  switch (type) {
    case "poll":
      return { question: "", options: ["", ""] };
    case "quiz":
      return { question: "", options: ["", ""], answer: -1 };
    case "question":
      return { prompt: "" };
    case "slider":
      return { prompt: "How hyped are you?" };
    case "countdown":
      // Tomorrow at this hour: a real time to change, not an empty field.
      return { title: "", at: new Date(now + 24 * 3600_000).toISOString() };
    case "addyours":
      return { prompt: "" };
  }
}

/** A quiz's options with blanks taken out, and where its answer ends up. */
function quizKept(quiz: QuizPayload): { options: string[]; answer: number } {
  const options: string[] = [];
  let answer = -1;
  quiz.options.forEach((o, i) => {
    if (!o.trim()) return;
    if (i === quiz.answer) answer = options.length;
    options.push(o.trim());
  });
  return { options, answer };
}

/**
 * Whether what has been written is a sticker yet, and if not, what is
 * missing — said under it rather than silently refusing Done.
 */
export function cardProblem(layer: CardLayer, now = Date.now()): string | null {
  switch (layer.type) {
    case "question":
      return (layer.payload as QuestionPayload).prompt.trim() ? null : "Write what you're asking.";
    case "slider":
      return (layer.payload as SliderPayload).prompt.trim() ? null : "Write what they're rating.";
    case "addyours":
      return (layer.payload as AddYoursPayload).prompt.trim() ? null : "Write the prompt.";
    case "countdown": {
      const c = layer.payload as CountdownPayload;
      if (!c.title.trim()) return "Name what's coming.";
      if (!(Date.parse(c.at) > now)) return "Pick a time that hasn't happened yet.";
      return null;
    }
    case "quiz": {
      const quiz = layer.payload as QuizPayload;
      if (!quiz.question.trim()) return "Write the question.";
      const kept = quizKept(quiz);
      if (kept.options.length < MIN_POLL_OPTIONS) return "Give it at least two options.";
      if (tidyOptions(kept.options).length !== kept.options.length) return "Make the options different from each other.";
      if (kept.answer < 0) return "Tap ✓ next to the right answer.";
      return null;
    }
    case "poll": {
      const poll = layer.payload as PollPayload;
      if (!poll.question.trim()) return "Write the question.";
      if (tidyOptions(poll.options).length < MIN_POLL_OPTIONS) return "Give it at least two different options.";
      return null;
    }
  }
}

/** Nothing written at all: Done takes the sticker away again. */
export function cardIsBlank(layer: CardLayer): boolean {
  switch (layer.type) {
    case "question":
      return !(layer.payload as QuestionPayload).prompt.trim();
    case "addyours":
      return !(layer.payload as AddYoursPayload).prompt.trim();
    case "slider":
      return !(layer.payload as SliderPayload).prompt.trim();
    case "countdown":
      return !(layer.payload as CountdownPayload).title.trim();
    case "poll":
    case "quiz": {
      const poll = layer.payload as PollPayload;
      return !poll.question.trim() && poll.options.every((o) => !o.trim());
    }
  }
}

/** The payload as it is kept once Done is pressed: trimmed, no blanks or repeats. */
export function tidyCard(layer: CardLayer): CardLayer {
  switch (layer.type) {
    case "question":
      return { ...layer, payload: { prompt: (layer.payload as QuestionPayload).prompt.trim() } };
    case "slider":
      return { ...layer, payload: { prompt: (layer.payload as SliderPayload).prompt.trim() } };
    case "addyours":
      return { ...layer, payload: { prompt: (layer.payload as AddYoursPayload).prompt.trim() } };
    case "countdown": {
      const c = layer.payload as CountdownPayload;
      return { ...layer, payload: { title: c.title.trim(), at: new Date(c.at).toISOString() } };
    }
    case "quiz": {
      const quiz = layer.payload as QuizPayload;
      return { ...layer, payload: { question: quiz.question.trim(), ...quizKept(quiz) } };
    }
    case "poll": {
      const poll = layer.payload as PollPayload;
      return { ...layer, payload: { question: poll.question.trim(), options: tidyOptions(poll.options) } };
    }
  }
}

/**
 * A poll or a question, written on the sticker itself.
 *
 * The sticker is drawn in its own colour at the middle of the screen and
 * every line of it is a field: tap the question to change it, tap an
 * option to change it, add one, take one away. What was a sheet with a
 * form in it is now the thing being made.
 */
export function CardEditor({
  layer,
  onChange,
  onDone,
}: {
  layer: CardLayer;
  onChange: (payload: CardPayload) => void;
  onDone: () => void;
}) {
  const look = lookFor(layer.type, layer.look, layer.tint);
  const problem = cardProblem(layer);
  const blank = cardIsBlank(layer);
  const field = "w-full min-w-0 bg-transparent outline-none placeholder:opacity-55";

  return (
    <div
      className="absolute inset-0 z-30 flex flex-col bg-black/40"
      onPointerDown={(e) => e.stopPropagation()}
      data-card-editor
    >
      <div className="flex items-center justify-between px-4 pt-3">
        <span className="text-[13px] font-bold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
          Tap any line to change it
        </span>
        <button
          type="button"
          onClick={onDone}
          disabled={!!problem && !blank}
          className="h-10 rounded-xl bg-white px-5 text-sm font-extrabold text-black transition active:scale-95 disabled:opacity-50"
        >
          Done
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div
          style={{ ...look.box, width: "100%", maxWidth: 300, boxSizing: "border-box", transform: "rotate(-2deg)" }}
          className="flex flex-col gap-2.5 shadow-[0_16px_40px_rgba(0,0,0,0.45)]"
        >
          {layer.type === "question" || layer.type === "slider" || layer.type === "addyours" ? (
            <>
              {layer.type === "addyours" && (
                <span style={{ ...look.title, fontSize: 10.5, letterSpacing: "0.1em" }} className="text-center">
                  ADD YOURS
                </span>
              )}
              <label className="contents">
                <span className="sr-only">
                  {layer.type === "question" ? "What you are asking" : layer.type === "slider" ? "What they rate" : "The prompt"}
                </span>
                <input
                  autoFocus
                  value={(layer.payload as QuestionPayload).prompt}
                  maxLength={layer.type === "addyours" ? MAX_STICKER_LINE : MAX_POLL_QUESTION}
                  onChange={(e) =>
                    onChange(
                      layer.type === "addyours"
                        ? { ...(layer.payload as AddYoursPayload), prompt: e.target.value }
                        : { prompt: e.target.value },
                    )
                  }
                  placeholder={layer.type === "question" ? "Ask me anything" : layer.type === "slider" ? "How hyped are you?" : "Your desk setup"}
                  style={{ ...look.title, fontSize: 17 }}
                  className={`${field} text-center`}
                />
              </label>
              {layer.type === "question" && (
                <span style={{ ...look.sub, fontSize: 12 }} className="flex h-10 items-center rounded-[13px] bg-white/10 px-3">
                  Type something…
                </span>
              )}
              {layer.type === "slider" && (
                <span aria-hidden className="relative mx-1 my-2 block h-2.5 rounded-full" style={{ background: `${look.ink}33` }}>
                  <span className="absolute inset-y-0 left-0 w-2/3 rounded-full" style={{ background: look.ink }} />
                  <span className="absolute left-2/3 top-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[10px] text-base" style={{ background: look.ink, color: "#0a0a0a" }}>
                    ★
                  </span>
                </span>
              )}
              {layer.type === "addyours" && (
                <span style={{ ...look.sub, fontSize: 12 }} className="flex h-9 items-center justify-center rounded-[11px] bg-white/10">
                  + Add yours
                </span>
              )}
            </>
          ) : layer.type === "countdown" ? (
            <>
              <label className="contents">
                <span className="sr-only">What&rsquo;s coming</span>
                <input
                  autoFocus
                  value={(layer.payload as CountdownPayload).title}
                  maxLength={MAX_STICKER_LINE}
                  onChange={(e) => onChange({ ...(layer.payload as CountdownPayload), title: e.target.value })}
                  placeholder="Trip to Goa"
                  style={{ ...look.title, fontSize: 17 }}
                  className={`${field} text-center`}
                />
              </label>
              <CountdownField
                at={(layer.payload as CountdownPayload).at}
                look={look}
                onPick={(at) => onChange({ ...(layer.payload as CountdownPayload), at: at.toISOString() })}
              />
            </>
          ) : (
            <PollFields layer={layer} onChange={onChange} field={field} />
          )}
        </div>

        <p role="status" className="mt-4 min-h-5 text-center text-xs font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
          {problem && !blank ? problem : ""}
        </p>
      </div>
    </div>
  );
}

function PollFields({
  layer,
  onChange,
  field,
}: {
  layer: CardLayer;
  onChange: (payload: PollPayload | QuizPayload) => void;
  field: string;
}) {
  const look = lookFor(layer.type, layer.look, layer.tint);
  const poll = layer.payload as QuizPayload;
  const quiz = layer.type === "quiz";
  const set = (next: Partial<QuizPayload>) => onChange({ ...poll, ...next });

  return (
    <>
      <label className="contents">
        <span className="sr-only">Question</span>
        <input
          autoFocus
          value={poll.question}
          maxLength={MAX_POLL_QUESTION}
          onChange={(e) => set({ question: e.target.value })}
          placeholder={quiz ? "Ask a quiz question" : "Ask a question"}
          style={{ ...look.title, fontSize: 17, borderBottom: `2px solid ${look.ink}55` }}
          className={`${field} pb-1 text-center`}
        />
      </label>
      {poll.options.map((option, i) => (
        <label
          key={i}
          className="flex h-10 items-center gap-2 rounded-[13px] px-3"
          style={{ border: `1px solid ${look.ink}40` }}
        >
          <span className="sr-only">Option {i + 1}</span>
          <input
            value={option}
            maxLength={MAX_POLL_OPTION}
            onChange={(e) => set({ options: poll.options.map((o, j) => (j === i ? e.target.value : o)) })}
            placeholder={`Option ${i + 1}`}
            style={{ ...look.title, fontSize: 14, fontWeight: 700 }}
            className={field}
          />
          {quiz && (
            <button
              type="button"
              aria-label={`Option ${i + 1} is the right answer`}
              aria-pressed={poll.answer === i}
              onClick={() => set({ answer: i })}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] text-sm font-black"
              style={
                poll.answer === i
                  ? { background: "#16a34a", color: "#ffffff" }
                  : { border: `2px solid ${look.ink}55`, color: look.ink }
              }
            >
              ✓
            </button>
          )}
          {poll.options.length > MIN_POLL_OPTIONS && (
            <button
              type="button"
              aria-label={`Remove option ${i + 1}`}
              onClick={() =>
                set({
                  options: poll.options.filter((_, j) => j !== i),
                  // The answer follows its option; removing it unmarks it.
                  ...(quiz ? { answer: poll.answer === i ? -1 : poll.answer > i ? poll.answer - 1 : poll.answer } : {}),
                })
              }
              style={{ color: look.ink }}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] opacity-70"
            >
              <X size={14} strokeWidth={2.6} />
            </button>
          )}
        </label>
      ))}
      {poll.options.length < MAX_POLL_OPTIONS && (
        <button
          type="button"
          onClick={() => set({ options: [...poll.options, ""] })}
          style={{ ...look.title, fontSize: 13 }}
          className="flex h-9 items-center justify-center gap-1.5 rounded-[11px]"
        >
          <Plus size={14} strokeWidth={3} />
          Add option
        </button>
      )}
    </>
  );
}

/**
 * When the countdown ends, as one line on the card: tapping it opens the
 * picker the message scheduler uses. It was the browser's own date field,
 * which looks different on every phone and like none of this app.
 */
function CountdownField({ at, look, onPick }: { at: string; look: ReturnType<typeof lookFor>; onPick: (at: Date) => void }) {
  const [open, setOpen] = useState(false);
  const when = Number.isNaN(Date.parse(at)) ? null : describeParts(new Date(at), new Date());
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ ...look.title, fontSize: 14, border: `1px solid ${look.ink}40` }}
        className="flex h-10 items-center justify-between gap-2 rounded-[12px] px-3"
      >
        <span style={{ ...look.sub, fontSize: 11, fontWeight: 700 }}>Ends</span>
        <span className="truncate">{when ? `${when.day}, ${when.time}` : "Pick a time"}</span>
      </button>
      {open && <CountdownWhen open at={at} onClose={() => setOpen(false)} onPick={onPick} />}
    </>
  );
}
