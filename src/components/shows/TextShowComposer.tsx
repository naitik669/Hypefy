"use client";

import { useState } from "react";
import { ChevronLeft, Loader2 } from "lucide-react";
import { haptics } from "@/lib/haptics";
import { useToast } from "@/components/ui/ToastProvider";
import {
  MONO_STACK,
  TEXT_SHOW_BACKGROUNDS,
  TEXT_SHOW_MAX,
  TEXT_SHOW_STYLES,
  renderTextShow,
  type TextShowStyle,
} from "@/lib/text-show";

/**
 * A Show that is only words: typed big in the middle of a colour.
 *
 * Next draws what is on screen into a picture and hands it on, so it goes
 * through the same arrange step as a photo — which is where polls,
 * questions and mentions are added — and the same publish.
 */
export function TextShowComposer({
  onCancel,
  onDone,
}: {
  onCancel: () => void;
  onDone: (file: File) => void;
}) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [style, setStyle] = useState<TextShowStyle>("bold");
  const [bgId, setBgId] = useState(TEXT_SHOW_BACKGROUNDS[0].id);
  const [busy, setBusy] = useState(false);
  const bg = TEXT_SHOW_BACKGROUNDS.find((b) => b.id === bgId) ?? TEXT_SHOW_BACKGROUNDS[0];
  const s = TEXT_SHOW_STYLES.find((x) => x.id === style)!;

  // Smaller as it grows, so a long thought still fits the screen while
  // typing — the picture does its own fitting at full size.
  const size = text.length < 40 ? 40 : text.length < 90 ? 32 : 26;

  async function next() {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      onDone(await renderTextShow({ text, style, background: bg }));
    } catch {
      toast("Couldn't make that into a Show. Try again.", "error");
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col transition-colors"
      style={{ background: bg.bg, color: bg.ink }}
      data-text-show
    >
      <div className="flex items-center justify-between px-4 pt-[max(1rem,var(--sat))]">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Back to the camera"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-black/25 text-white active:scale-95"
        >
          <ChevronLeft size={22} />
        </button>
        <button
          type="button"
          onClick={next}
          disabled={!text.trim() || busy}
          className="flex h-10 items-center gap-2 rounded-pill bg-white px-5 text-sm font-extrabold text-black transition active:scale-95 disabled:opacity-50"
        >
          {busy && <Loader2 size={15} className="animate-spin" />}
          Next
        </button>
      </div>

      <div role="radiogroup" aria-label="Type style" className="mt-4 flex justify-center gap-2 px-4">
        {TEXT_SHOW_STYLES.map((t) => {
          const on = t.id === style;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                haptics.select();
                setStyle(t.id);
              }}
              style={{
                fontFamily: t.fontVar ? `var(${t.fontVar})` : MONO_STACK,
                fontStyle: t.italic ? "italic" : "normal",
                fontWeight: t.weight,
              }}
              className={`h-9 rounded-pill px-3.5 text-[13px] transition ${
                on ? "bg-white text-black" : "border border-current/40 bg-black/10"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <label className="flex flex-1 items-center justify-center px-8">
        <span className="sr-only">What do you want to say?</span>
        <textarea
          autoFocus
          value={text}
          maxLength={TEXT_SHOW_MAX}
          onChange={(e) => setText(e.target.value)}
          placeholder="Say something"
          rows={4}
          style={{
            fontFamily: s.fontVar ? `var(${s.fontVar})` : MONO_STACK,
            fontStyle: s.italic ? "italic" : "normal",
            fontWeight: s.weight,
            fontSize: size,
            color: bg.ink,
            caretColor: bg.ink,
          }}
          className="w-full resize-none bg-transparent text-center leading-[1.12] tracking-tight outline-none placeholder:opacity-45"
        />
      </label>

      <div className="flex flex-col items-center gap-3 pb-[max(1.5rem,var(--sab))]">
        <div role="radiogroup" aria-label="Background colour" className="flex items-center gap-2.5">
          {TEXT_SHOW_BACKGROUNDS.map((b) => {
            const on = b.id === bgId;
            return (
              <button
                key={b.id}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={b.label}
                onClick={() => {
                  haptics.select();
                  setBgId(b.id);
                }}
                style={{ background: b.bg }}
                className={`rounded-full transition-all ${on ? "h-9 w-9 border-[3px] border-white" : "h-8 w-8 border-2 border-white/60"}`}
              />
            );
          })}
        </div>
        <p className="text-[11px] font-semibold opacity-70">
          {text.length}/{TEXT_SHOW_MAX} · polls, questions and mentions are next
        </p>
      </div>
    </div>
  );
}
