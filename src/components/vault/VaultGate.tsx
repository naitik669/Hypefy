"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { safeBack } from "@/lib/safe-back";
import { markVaultOpen } from "@/lib/chat-vault";
import { useStepUp } from "@/components/auth/StepUpDialog";
import { PinPad } from "@/components/vault/PinPad";
import { ChatPinSetup } from "@/components/vault/ChatPinSetup";

/**
 * The door. Drawn by the server in place of a locked chat or a locked list,
 * so nothing behind it has been sent to this screen yet.
 *
 * A right PIN records the unlock on the server and asks the page to draw
 * itself again; this time the server sends what was behind the door.
 */
export function VaultGate({
  title,
  sub = "Enter your PIN",
}: {
  title: string;
  sub?: string;
}) {
  const supabase = createClient();
  const router = useRouter();
  const { requireStepUp, stepUpDialog } = useStepUp();
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  async function tryPin(pin: string): Promise<boolean> {
    setError(null);
    const { data, error: err } = await supabase.rpc("unlock_vault", { p_pin: pin });
    if (err) {
      // The rate limit speaks for itself ("Too many attempts…"): pass it on.
      setError(err.message || "Couldn't check that. Try again.");
      return false;
    }
    if (!data) {
      setError("Wrong PIN");
      return false;
    }
    markVaultOpen();
    router.refresh();
    return true;
  }

  /** Forgot it: prove who you are, then choose a new one. Chats stay as they are. */
  async function forgot() {
    setError(null);
    // maxAge 0: this wants proof from now, not from four minutes ago.
    if (!(await requireStepUp({ maxAge: 0 }))) return;
    setResetting(true);
  }

  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-[480px] flex-col items-center justify-center gap-6 px-8" data-vault-gate>
      {stepUpDialog}
      <button
        type="button"
        onClick={() => safeBack(router, "/messages")}
        aria-label="Back"
        className="absolute left-2 top-[max(0.5rem,var(--sat))] flex h-10 w-10 items-center justify-center rounded-full text-foreground"
      >
        <ChevronLeft size={24} />
      </button>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface text-accent">
        <Lock size={24} />
      </div>
      <div className="text-center">
        <h1 className="text-lg font-bold">{title}</h1>
        <p className="mt-1 text-sm text-muted">{sub}</p>
      </div>
      <PinPad onSubmit={tryPin} error={error} />
      <button type="button" onClick={forgot} className="text-xs font-semibold text-muted underline-offset-2 hover:underline">
        Forgot PIN?
      </button>

      {resetting && (
        <ChatPinSetup
          reason="reset"
          onClose={() => setResetting(false)}
          onDone={(pin) => {
            setResetting(false);
            void tryPin(pin);
          }}
        />
      )}
    </div>
  );
}
