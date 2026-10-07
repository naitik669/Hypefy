"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { safeBack } from "@/lib/safe-back";
import { markVaultOpen } from "@/lib/chat-vault";
import { haptics } from "@/lib/haptics";
import { useStepUp } from "@/components/auth/StepUpDialog";
import { PinPad } from "@/components/vault/PinPad";
import { ChatPinSetup } from "@/components/vault/ChatPinSetup";
import s from "./vault.module.css";

/** How long the green lamp is left on before the list replaces the box. */
export const CASE_OPEN_MS = 320;
/** How long the red lamp stays on after a wrong PIN. */
export const CASE_REFUSE_MS = 900;

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
   * "case": the Vault's own door. A strongbox, with the PIN entered on its
   * front, not under a picture of it. It answers with a buzz and a lamp: red
   * for a wrong PIN, green for the right one. Locked chats keep the plain pad.
   */
  look?: "plain" | "case";
}) {
  const supabase = createClient();
  const router = useRouter();
  const { requireStepUp, stepUpDialog } = useStepUp();
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  /** The box's lamp: dark, red at a wrong PIN, green at the right one. */
  const [lamp, setLamp] = useState<"off" | "red" | "green">("off");
  const lampTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * How many digits this account's PIN has. Asked before the pad will take
   * anything: a pad that guessed four would send an older six digit PIN two
   * digits early, as a wrong one. `undefined` while asking; `null` when it
   * is an older PIN whose length nobody recorded.
   */
  const [pinLength, setPinLength] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void supabase.rpc("chat_pin_places").then(({ data, error: err }) => {
      if (!live) return;
      // If it cannot be asked, offer the pad that can type any PIN.
      setPinLength(err ? null : (data as number | null));
    });
    return () => {
      live = false;
    };
    // The client is made fresh each render; this is asked once per door.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => { if (lampTimer.current) clearTimeout(lampTimer.current); }, []);

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
        haptics.error();
        setLamp("red");
        if (lampTimer.current) clearTimeout(lampTimer.current);
        lampTimer.current = setTimeout(() => setLamp("off"), CASE_REFUSE_MS);
      }
      return false;
    }
    markVaultOpen();
    if (look === "case") {
      // A buzz and the green lamp, held just long enough to be seen.
      haptics.success();
      if (lampTimer.current) clearTimeout(lampTimer.current);
      setLamp("green");
      lampTimer.current = setTimeout(() => router.refresh(), CASE_OPEN_MS);
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
        <div data-vault-case={lamp} className={s.case}>
          <i className={s.rivet} />
          <i className={s.rivet} />
          <i className={s.rivet} />
          <i className={s.rivet} />
          <div className={s.top}>
            <h1 className={s.plate}>{title.toUpperCase()}</h1>
            <span
              aria-hidden
              className={`${s.lamp} ${lamp === "red" ? s.lampRed : lamp === "green" ? s.lampGreen : ""}`}
            />
          </div>
          <div className="mt-4 w-full">
            <PinPad
              onSubmit={tryPin}
              error={error}
              look="case"
              hint={sub}
              length={pinLength ?? null}
              disabled={lamp === "green" || pinLength === undefined}
            />
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
          <PinPad onSubmit={tryPin} error={error} length={pinLength ?? null} disabled={pinLength === undefined} />
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
