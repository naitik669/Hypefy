"use client";

import { Plus, X } from "lucide-react";
import { lookFor } from "@/lib/show-looks";
import {
  MAX_POLL_OPTION,
  MAX_POLL_OPTIONS,
  MAX_POLL_QUESTION,
  MIN_POLL_OPTIONS,
  tidyOptions,
} from "@/lib/chat-poll";
import type { PollPayload, QuestionPayload, ShowLayer } from "@/lib/show-layers";

/** The layers written on the sticker itself rather than in a sheet. */
export type CardLayer = ShowLayer & { type: "poll" | "question" };

export function isCard(layer: ShowLayer | null): layer is CardLayer {
  return !!layer && (layer.type === "poll" || layer.type === "question");
}

/**
 * Whether what has been written is a sticker yet, and if not, what is
 * missing — said under it rather than silently refusing Done.
 */
export function cardProblem(layer: CardLayer): string | null {
  if (layer.type === "question") {
    return (layer.payload as QuestionPayload).prompt.trim() ? null : "Write what you're asking.";
  }
  const poll = layer.payload as PollPayload;
  if (!poll.question.trim()) return "Write the question.";
  if (tidyOptions(poll.options).length < MIN_POLL_OPTIONS) return "Give it at least two different options.";
  return null;
}

/** Nothing written at all: Done takes the sticker away again. */
export function cardIsBlank(layer: CardLayer): boolean {
  if (layer.type === "question") return !(layer.payload as QuestionPayload).prompt.trim();
  const poll = layer.payload as PollPayload;
  return !poll.question.trim() && poll.options.every((o) => !o.trim());
}

/** The payload as it is kept once Done is pressed: trimmed, no blanks or repeats. */
export function tidyCard(layer: CardLayer): CardLayer {
  if (layer.type === "question") {
    const q = layer.payload as QuestionPayload;
    return { ...layer, payload: { prompt: q.prompt.trim() } };
  }
  const poll = layer.payload as PollPayload;
  return { ...layer, payload: { question: poll.question.trim(), options: tidyOptions(poll.options) } };
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
  onChange: (payload: PollPayload | QuestionPayload) => void;
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
          {layer.type === "question" ? (
            <>
              <label className="contents">
                <span className="sr-only">What you are asking</span>
                <input
                  autoFocus
                  value={(layer.payload as QuestionPayload).prompt}
                  maxLength={MAX_POLL_QUESTION}
                  onChange={(e) => onChange({ prompt: e.target.value })}
                  placeholder="Ask me anything"
                  style={{ ...look.title, fontSize: 17 }}
                  className={`${field} text-center`}
                />
              </label>
              <span
                style={{ ...look.sub, fontSize: 12 }}
                className="flex h-10 items-center rounded-[13px] bg-white/10 px-3"
              >
                Type something…
              </span>
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
  onChange: (payload: PollPayload) => void;
  field: string;
}) {
  const look = lookFor(layer.type, layer.look, layer.tint);
  const poll = layer.payload as PollPayload;
  const set = (next: Partial<PollPayload>) => onChange({ ...poll, ...next });

  return (
    <>
      <label className="contents">
        <span className="sr-only">Question</span>
        <input
          autoFocus
          value={poll.question}
          maxLength={MAX_POLL_QUESTION}
          onChange={(e) => set({ question: e.target.value })}
          placeholder="Ask a question"
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
          {poll.options.length > MIN_POLL_OPTIONS && (
            <button
              type="button"
              aria-label={`Remove option ${i + 1}`}
              onClick={() => set({ options: poll.options.filter((_, j) => j !== i) })}
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
