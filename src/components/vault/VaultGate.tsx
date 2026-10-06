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
import s from "./vault.module.css";

/** How long the box takes to fall open, before the list is drawn behind it. */
export const CASE_OPEN_MS = 440;

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
  look = "plain",
}: {
  title: string;
  sub?: string;
  /**
   * "case": the Vault's own door. A strongbox pops up and the PIN is entered
   * on its front, not under a picture of it. Locked chats keep the plain pad.
   */
  look?: "plain" | "case";
}) {
  const supabase = createClient();
  const router = useRouter();
  const { requireStepUp, stepUpDialog } = useStepUp();
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  /** The box: still, shaking at a wrong PIN, or falling open at the right one. */
  const [box, setBox] = useState<"still" | "shake" | "opening">("still");

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
      if (look === "case") {
        // Off and on again, so a second wrong PIN shakes it a second time.
        setBox("still");
        requestAnimationFrame(() => setBox("shake"));
      }
      return false;
    }
    markVaultOpen();
    if (look === "case") {
      // Let the front fall away before the list is drawn where it stood.
      setBox("opening");
      setTimeout(() => router.refresh(), CASE_OPEN_MS);
      return true;
    }
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
      {look === "case" ? (
        <div
          data-vault-case={box}
          className={`${s.case} ${box === "shake" ? s.shake : ""} ${box === "opening" ? s.opening : ""}`}
          onAnimationEnd={() => box === "shake" && setBox("still")}
        >
          <i className={s.rivet} />
          <i className={s.rivet} />
          <i className={s.rivet} />
          <i className={s.rivet} />
          <h1 className={s.plate}>{title.toUpperCase()}</h1>
          <div className="mt-4 w-full">
            <PinPad onSubmit={tryPin} error={error} look="case" hint={sub} disabled={box === "opening"} />
          </div>
          <span aria-hidden className={s.handle} />
        </div>
      ) : (
        <>
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface text-accent">
            <Lock size={24} />
          </div>
          <div className="text-center">
            <h1 className="text-lg font-bold">{title}</h1>
            <p className="mt-1 text-sm text-muted">{sub}</p>
          </div>
          <PinPad onSubmit={tryPin} error={error} />
        </>
      )}
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
