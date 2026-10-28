"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import {
  MAX_POLL_OPTION,
  MAX_POLL_OPTIONS,
  MAX_POLL_QUESTION,
  MIN_POLL_OPTIONS,
  pollReady,
  tidyOptions,
} from "@/lib/chat-poll";

/**
 * Writing a poll.
 *
 * Two empty options to start with, because that is the fewest a poll can
 * have and starting at one would make the first thing you do adding a row.
 */
export function PollComposer({
  open,
  onClose,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  onSend: (question: string, options: string[], multi: boolean) => void;
}) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [multi, setMulti] = useState(false);

  function reset() {
    setQuestion("");
    setOptions(["", ""]);
    setMulti(false);
  }

  function setOption(i: number, value: string) {
    setOptions((prev) => prev.map((o, at) => (at === i ? value : o)));
  }

  const ready = pollReady(question, options);

  return (
    <BottomSheet
      open={open}
      onClose={() => {
        onClose();
        reset();
      }}
      title="New poll"
      footer={
        <div className="flex items-center gap-2 border-t border-border bg-elevated px-4 py-3">
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
          <button
            type="button"
            disabled={!ready}
            onClick={() => {
              // Sent exactly as it will be kept, so what arrives in the
              // thread is what the sheet was showing.
              onSend(question.trim(), tidyOptions(options), multi);
              onClose();
              reset();
            }}
            className="flex-1 rounded-xl bg-accent px-3 py-2 text-sm font-bold text-accent-ink transition active:scale-95 disabled:opacity-40"
          >
            Send poll
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 px-4 pb-4">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={MAX_POLL_QUESTION}
          placeholder="Ask something…"
          className="h-11 w-full rounded-2xl bg-surface px-4 text-sm outline-none placeholder:text-faint"
        />

        <div className="flex flex-col gap-2">
          {options.map((option, i) => (
            <div key={i} className="flex items-center gap-2">
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
                  onClick={() => setOptions((prev) => prev.filter((_, at) => at !== i))}
                  aria-label={`Remove option ${i + 1}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/5 hover:text-foreground"
                >
                  <X size={15} />
                </button>
              )}
            </div>
          ))}
        </div>

        {options.length < MAX_POLL_OPTIONS && (
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
