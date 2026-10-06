"use client";

import { useEffect, useState } from "react";
import { Delete } from "lucide-react";

/**
 * A keypad for a 4 to 6 digit PIN: the same pad the app lock draws, for the
 * chat PIN.
 *
 * Six digits submit themselves; a shorter PIN needs Enter. `onSubmit` says
 * whether it was accepted, and a refusal clears the pad so the next try
 * starts clean. Digits, Enter and Backspace work from a keyboard too, since
 * the Vault has to open on a laptop.
 */
export function PinPad({
  onSubmit,
  error,
  disabled,
}: {
  onSubmit: (pin: string) => Promise<boolean> | boolean;
  /** Shown under the dots; the caller owns the wording. */
  error?: string | null;
  disabled?: boolean;
}) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(value: string) {
    if (busy || disabled || value.length < 4) return;
    setBusy(true);
    const ok = await onSubmit(value);
    setBusy(false);
    if (!ok) setPin("");
  }

  function press(digit: string) {
    if (busy || disabled) return;
    const next = (pin + digit).slice(0, 6);
    setPin(next);
    if (next.length === 6) void submit(next);
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
      else if (e.key === "Enter") void submit(pin);
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // Rebound each render on purpose: the handlers close over the current pin.
  });

  const key =
    "h-14 rounded-2xl bg-surface text-xl font-semibold transition-transform active:scale-95 disabled:opacity-40";

  return (
    <div className="flex w-full flex-col items-center gap-5" data-pin-pad>
      <div className="flex h-6 items-center gap-3" aria-label={`${pin.length} digits entered`}>
        {Array.from({ length: 6 }).map((_, i) => (
          <span
            key={i}
            className={`h-2.5 w-2.5 rounded-full transition-colors ${i < pin.length ? "bg-accent" : "bg-surface"}`}
          />
        ))}
      </div>

      <p role={error ? "alert" : undefined} className="h-4 text-center text-xs font-semibold text-danger">
        {error ?? ""}
      </p>

      <div className="grid w-full max-w-[260px] grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" onClick={() => press(d)} disabled={busy || disabled} className={key}>
            {d}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void submit(pin)}
          disabled={pin.length < 4 || busy || disabled}
          className="h-14 rounded-2xl bg-surface text-xs font-bold text-muted transition-transform active:scale-95 disabled:opacity-40"
        >
          Enter
        </button>
        <button type="button" onClick={() => press("0")} disabled={busy || disabled} className={key}>
          0
        </button>
        <button
          type="button"
          onClick={erase}
          aria-label="Delete"
          className="flex h-14 items-center justify-center rounded-2xl bg-surface text-muted transition-transform active:scale-95"
        >
          <Delete size={20} />
        </button>
      </div>
    </div>
  );
}
