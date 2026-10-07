"use client";

import { useEffect, useState } from "react";
import { Delete } from "lucide-react";
import { PIN_LENGTH, padFor } from "@/lib/chat-vault";

/**
 * A keypad for the chat PIN.
 *
 * A PIN is four digits, and the fourth sends it: no Enter key, because there
 * is nothing shorter or longer to wait for. `length` says otherwise for a
 * PIN chosen before that rule: its real length if the server knows it, or
 * null if it does not, in which case the pad offers six places and an Enter
 * key so that any older PIN can still be typed.
 *
 * `onSubmit` says whether it was accepted, and a refusal clears the pad so
 * the next try starts clean. Digits, Backspace and Enter work from a keyboard
 * too, since the Vault has to open on a laptop.
 */
export function PinPad({
  onSubmit,
  error,
  disabled,
  look = "plain",
  hint,
  length = PIN_LENGTH,
}: {
  onSubmit: (pin: string) => Promise<boolean> | boolean;
  /** Shown under the dots; the caller owns the wording. */
  error?: string | null;
  disabled?: boolean;
  /**
   * "case": the pad is part of the Vault's strongbox. The digits show on a
   * dark display set into the box, and the keys are cut into its front,
   * in the flat greys of the empty-screen drawings.
   */
  look?: "plain" | "case";
  /** What the line under the display says when there is no error. */
  hint?: string;
  /** How many digits the PIN has; null when it is an older one of unknown length. */
  length?: number | null;
}) {
  const pad = padFor(length);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(value: string) {
    const complete = pad.enter ? value.length >= PIN_LENGTH : value.length === pad.places;
    if (busy || disabled || !complete) return;
    setBusy(true);
    const ok = await onSubmit(value);
    setBusy(false);
    if (!ok) setPin("");
  }

  function press(digit: string) {
    if (busy || disabled) return;
    const next = (pin + digit).slice(0, pad.places);
    setPin(next);
    if (next.length === pad.places) void submit(next);
  }

  function erase() {
    if (busy) return;
    setPin((p) => p.slice(0, -1));
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") erase();
      else if (e.key === "Enter" && pad.enter) void submit(pin);
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // Rebound each render on purpose: the handlers close over the current pin.
  });

  const inCase = look === "case";
  const key = inCase
    ? "h-12 rounded-xl border-[2.5px] border-[#333] bg-[#1c1c1c] text-lg font-bold text-[#d4d4d4] transition-transform active:scale-95 active:bg-[#141414] disabled:opacity-40"
    : "h-14 rounded-2xl bg-surface text-xl font-semibold transition-transform active:scale-95 disabled:opacity-40";
  const small = inCase
    ? "h-12 rounded-xl border-[2.5px] border-[#333] bg-[#1c1c1c] text-[11px] font-bold text-[#777] transition-transform active:scale-95 disabled:opacity-40"
    : "h-14 rounded-2xl bg-surface text-xs font-bold text-muted transition-transform active:scale-95 disabled:opacity-40";

  return (
    <div className={`flex w-full flex-col items-center ${inCase ? "gap-3" : "gap-5"}`} data-pin-pad={look}>
      {inCase ? (
        // The display: a dark slot in the steel, and the one place the
        // drawing uses the lime.
        <div
          className="flex h-11 w-full items-center justify-center gap-3 rounded-xl border-[2.5px] border-[#333] bg-[#141414]"
          aria-label={`${pin.length} digits entered`}
        >
          {Array.from({ length: pad.places }).map((_, i) => (
            <span
              key={i}
              className={`h-2.5 w-2.5 rounded-full transition-colors ${i < pin.length ? "bg-accent" : "bg-[#2a2a2a]"}`}
            />
          ))}
        </div>
      ) : (
        <div className="flex h-6 items-center gap-3" aria-label={`${pin.length} digits entered`}>
          {Array.from({ length: pad.places }).map((_, i) => (
            <span
              key={i}
              className={`h-2.5 w-2.5 rounded-full transition-colors ${i < pin.length ? "bg-accent" : "bg-surface"}`}
            />
          ))}
        </div>
      )}

      <p
        role={error ? "alert" : undefined}
        className={`h-4 text-center text-xs font-semibold ${error ? "text-danger" : inCase ? "text-[#666]" : "text-danger"}`}
      >
        {error ?? hint ?? ""}
      </p>

      <div className={`grid w-full grid-cols-3 ${inCase ? "gap-2.5" : "max-w-[260px] gap-3"}`}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" onClick={() => press(d)} disabled={busy || disabled} className={key}>
            {d}
          </button>
        ))}
        {pad.enter ? (
          // Only for an older PIN of unknown length: it may be done at four,
          // five or six, so the pad has to be told.
          <button
            type="button"
            onClick={() => void submit(pin)}
            disabled={pin.length < PIN_LENGTH || busy || disabled}
            className={small}
          >
            Enter
          </button>
        ) : (
          // Where Enter was: the last digit sends the PIN by itself.
          <span aria-hidden />
        )}
        <button type="button" onClick={() => press("0")} disabled={busy || disabled} className={key}>
          0
        </button>
        <button
          type="button"
          onClick={erase}
          aria-label="Delete"
          className={`flex items-center justify-center ${small}`}
        >
          <Delete size={20} />
        </button>
      </div>
    </div>
  );
}
