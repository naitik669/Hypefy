"use client";

import { useState } from "react";
import { Lock, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { shieldProps, useOverlayShield } from "@/lib/overlay-shield";
import { PinPad } from "@/components/vault/PinPad";

/**
 * Choose the chat PIN: once, then again to be sure.
 *
 * Shown the first time someone locks a chat, when they change the PIN, and
 * after "Forgot PIN" once they have proved who they are. It only sets the
 * PIN; whether that is allowed is the database's decision (a PIN that
 * already exists needs the chats unlocked or a fresh sign-in, see 0115).
 */
export function ChatPinSetup({
  reason,
  onDone,
  onClose,
}: {
  /** Why they are here, said in the heading. */
  reason: "first" | "change" | "reset";
  /** The PIN is set. Handed back so the caller can unlock with it. */
  onDone: (pin: string) => void;
  onClose: () => void;
}) {
  const supabase = createClient();
  const [first, setFirst] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useOverlayShield(true, onClose);

  async function entered(pin: string): Promise<boolean> {
    setError(null);
    if (first === null) {
      setFirst(pin);
      // Clear the pad for the second entry.
      return false;
    }
    if (pin !== first) {
      setFirst(null);
      setError("Those didn't match. Start again.");
      return false;
    }
    const { error: err } = await supabase.rpc("set_lock_pin", { p_scope: "chat", p_pin: pin });
    if (err) {
      setFirst(null);
      setError(err.message || "Couldn't set the PIN. Try again.");
      return false;
    }
    onDone(pin);
    return true;
  }

  const title =
    first !== null
      ? "Enter it again"
      : reason === "first"
        ? "Choose a PIN for locked chats"
        : "Choose a new PIN";

  return (
    <div
      {...shieldProps}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[260] mx-auto flex max-w-[480px] flex-col items-center justify-center gap-6 bg-background px-8"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Cancel"
        className="absolute left-3 top-[max(0.75rem,var(--sat))] flex h-10 w-10 items-center justify-center rounded-full text-muted"
      >
        <X size={22} />
      </button>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface text-accent">
        <Lock size={24} />
      </div>
      <div className="text-center">
        <h1 className="text-lg font-bold">{title}</h1>
        <p className="mt-1 max-w-[30ch] text-sm text-muted">
          {first !== null
            ? "Once more, so a slip doesn't lock you out."
            : "4 to 6 digits. It opens your locked chats, and is separate from the app lock."}
        </p>
      </div>
      <PinPad onSubmit={entered} error={error} />
    </div>
  );
}
