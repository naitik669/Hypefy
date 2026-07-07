"use client";

import { useRef, useState } from "react";
import { Dices } from "lucide-react";
import { haptics } from "@/lib/haptics";

export type StatusValue = { emoji: string; text: string };

/** Curated pool the dice rolls from — emoji and text always land as a pair. */
const DICE_POOL: StatusValue[] = [
  { emoji: "🎧", text: "locked in" },
  { emoji: "🪫", text: "low battery" },
  { emoji: "🔥", text: "on one" },
  { emoji: "🧊", text: "chillin" },
  { emoji: "💀", text: "done today" },
  { emoji: "✨", text: "main character" },
  { emoji: "🎮", text: "grinding" },
  { emoji: "📚", text: "studying" },
  { emoji: "🏃", text: "outside" },
  { emoji: "🥱", text: "bored" },
  { emoji: "❤️", text: "soft hours" },
  { emoji: "🌙", text: "up late" },
  { emoji: "🫠", text: "melting" },
  { emoji: "📡", text: "touching grass" },
  { emoji: "🧠", text: "delulu hours" },
  { emoji: "🍜", text: "hungry again" },
  { emoji: "🎬", text: "binge mode" },
  { emoji: "🫡", text: "on duty" },
  { emoji: "🌧️", text: "in my feels" },
  { emoji: "⚡", text: "hyper today" },
  { emoji: "🤫", text: "plotting" },
  { emoji: "🛌", text: "bed rotting" },
  { emoji: "🎯", text: "focused fr" },
  { emoji: "🌊", text: "going with it" },
  { emoji: "🦋", text: "feeling myself" },
  { emoji: "☕", text: "caffeinated" },
  { emoji: "🚶", text: "hot girl walk" },
  { emoji: "🤍", text: "healing era" },
  { emoji: "😮‍💨", text: "surviving" },
  { emoji: "🎲", text: "feeling lucky" },
];

/** Quick strip shown when the emoji slot is tapped. */
const EMOJI_STRIP = ["🎧", "🔥", "🧊", "💀", "✨", "🎮", "❤️", "🌙", "🫠", "⚡", "🥱", "📚", "🌧️", "☕", "🦋", "🤫"];

/** Grab the leading emoji cluster (handles ZWJ sequences + variation selectors). */
export function splitStatus(raw: string | null): StatusValue {
  if (!raw) return { emoji: "", text: "" };
  const m = raw.match(
    /^(\p{Extended_Pictographic}(?:[\u{FE0F}\u{200D}]\p{Extended_Pictographic}?|\p{Emoji_Modifier})*)\s*(.*)$/u,
  );
  if (m) return { emoji: m[1], text: m[2] };
  return { emoji: "", text: raw };
}

export function joinStatus(v: StatusValue): string {
  return [v.emoji, v.text.trim()].filter(Boolean).join(" ");
}

/**
 * The app-wide "status" input: a big emoji slot, a text field, and a dice
 * that rolls a random emoji+text combo. Tapping the emoji slot opens a
 * curated strip — or just type with the OS emoji keyboard, the slot is a
 * real input. Used by the Vibe picker and the Note editor so every
 * status-ish surface feels the same.
 */
export function StatusComposer({
  value,
  onChange,
  placeholder = "what's the vibe…",
  maxTextLen = 24,
  presets = DICE_POOL.slice(0, 4),
  autoFocus = false,
}: {
  value: StatusValue;
  onChange: (v: StatusValue) => void;
  placeholder?: string;
  maxTextLen?: number;
  presets?: StatusValue[];
  autoFocus?: boolean;
}) {
  const [stripOpen, setStripOpen] = useState(false);
  const emojiInputRef = useRef<HTMLInputElement>(null);
  const lastRollRef = useRef(-1);

  function roll() {
    haptics.tap();
    let i = Math.floor(Math.random() * DICE_POOL.length);
    if (i === lastRollRef.current) i = (i + 1) % DICE_POOL.length; // never repeat back-to-back
    lastRollRef.current = i;
    onChange({ emoji: DICE_POOL[i].emoji, text: DICE_POOL[i].text.slice(0, maxTextLen) });
    setStripOpen(false);
  }

  function setEmojiFromTyping(rawInput: string) {
    // Keep only the last emoji cluster typed; ignore plain characters.
    const clusters = [...new Intl.Segmenter().segment(rawInput)].map((s) => s.segment);
    const emojis = clusters.filter((c) => /\p{Extended_Pictographic}/u.test(c));
    onChange({ ...value, emoji: emojis.length ? emojis[emojis.length - 1] : "" });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* [ emoji ] [ text ................ ] [ dice ] */}
      <div className="flex items-stretch gap-2">
        <input
          ref={emojiInputRef}
          value={value.emoji}
          onChange={(e) => setEmojiFromTyping(e.target.value)}
          onFocus={(e) => { setStripOpen(true); e.target.select(); }}
          placeholder="🙂"
          aria-label="Status emoji"
          inputMode="text"
          className="h-14 w-14 shrink-0 rounded-2xl border border-border bg-surface text-center text-[26px] leading-none outline-none transition-colors placeholder:opacity-35 focus:border-accent/40"
        />
        <input
          value={value.text}
          onChange={(e) => onChange({ ...value, text: e.target.value.slice(0, maxTextLen) })}
          onFocus={() => setStripOpen(false)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          aria-label="Status text"
          className="h-14 min-w-0 flex-1 rounded-2xl border border-border bg-surface px-4 text-[15px] font-medium outline-none transition-colors placeholder:text-faint focus:border-accent/40"
        />
        <button
          type="button"
          onClick={roll}
          aria-label="Random vibe"
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface text-muted transition-all hover:text-foreground active:scale-90 active:rotate-12"
        >
          <Dices size={22} />
        </button>
      </div>

      {/* Curated emoji strip — appears when the emoji slot is focused */}
      {stripOpen && (
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto rounded-2xl border border-border bg-surface p-2">
          {EMOJI_STRIP.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => {
                haptics.select();
                onChange({ ...value, emoji: e });
                setStripOpen(false);
              }}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl transition-transform active:scale-90 ${
                value.emoji === e ? "bg-accent/15 ring-1 ring-accent/40" : "hover:bg-white/[0.05]"
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      )}

      {/* Four small suggestions — the dice handles deeper discovery */}
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => {
          const active = value.emoji === p.emoji && value.text === p.text;
          return (
            <button
              key={p.emoji + p.text}
              type="button"
              onClick={() => {
                haptics.select();
                onChange({ emoji: p.emoji, text: p.text.slice(0, maxTextLen) });
                setStripOpen(false);
              }}
              className={`rounded-pill border px-3 py-1.5 text-xs font-semibold transition-colors ${
                active
                  ? "border-accent/40 bg-accent/[0.08] text-accent"
                  : "border-border bg-surface text-muted hover:text-foreground"
              }`}
            >
              {p.emoji} {p.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
