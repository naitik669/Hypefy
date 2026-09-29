"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { KeyRound, Lock, ShieldCheck } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useToast } from "@/components/ui/ToastProvider";
import { RecoveryCodeScreen } from "@/components/e2ee/RecoveryCodeScreen";
import { E2EE_ENABLED } from "@/lib/e2ee/flag";
import { E2EE_OPEN_SETUP } from "@/lib/e2ee/open-setup";
import {
  confirmRecovery,
  encryptionState,
  enroll,
  reissueRecoveryCode,
  unlock,
} from "@/lib/e2ee/vault";

/**
 * How a person gets from "signed in" to "their messages are encrypted",
 * whichever way they signed in.
 *
 * Mounted once in the app shell. It does nothing at all for an account that
 * is already ready — one cheap local read, no network — and it never stands
 * between anyone and Home, Discover or a profile: the first look happens a
 * couple of seconds after load, off the critical path.
 *
 * What it will and will not do on its own:
 *   · no vault yet          offers to set one up, once, and remembers a "not
 *                           now" rather than asking again next page.
 *   · set up but unconfirmed  offers to finish, once per session. Nothing was
 *                           ever encrypted under it, so a new code is free.
 *   · vault on another device  says nothing. A second phone is not an error
 *                           and must not nag; the thread's locked bubble is
 *                           where "unlock" is offered, when there is
 *                           something to read.
 *
 * It renders nothing unless E2EE is switched on (see lib/e2ee/flag.ts).
 */


/** How long after load before the first look. Enrollment is never urgent. */
const FIRST_LOOK_MS = 2500;

type View =
  | { kind: "idle" }
  | { kind: "intro"; finishing: boolean }
  | { kind: "code"; code: string }
  | { kind: "unlock"; canUsePassword: boolean };

const IDLE: View = { kind: "idle" };

function later(userId: string): string {
  return `hypefy:e2ee:later:${userId}`;
}
function askedThisSession(userId: string): string {
  return `hypefy:e2ee:asked:${userId}`;
}

/** Storage that may be missing or throw — private windows, blocked data. */
function readFlag(store: "local" | "session", key: string): boolean {
  try {
    return (store === "local" ? localStorage : sessionStorage).getItem(key) === "1";
  } catch {
    return false;
  }
}
function writeFlag(store: "local" | "session", key: string): void {
  try {
    (store === "local" ? localStorage : sessionStorage).setItem(key, "1");
  } catch {
    /* nothing to remember it in — the worst case is being asked again */
  }
}

export function EncryptionSetup({ userId }: { userId: string }) {
  const toast = useToast();
  const [view, setView] = useState<View>(IDLE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Decide what, if anything, this account needs. `explicit` = they asked. */
  const route = useCallback(
    async (explicit: boolean) => {
      const now = await encryptionState(userId);

      if (now.state === "no-vault") {
        if (explicit || !readFlag("local", later(userId))) setView({ kind: "intro", finishing: false });
      } else if (now.state === "recovery-pending") {
        if (explicit || !readFlag("session", askedThisSession(userId))) {
          writeFlag("session", askedThisSession(userId));
          setView({ kind: "intro", finishing: true });
        }
      } else if (now.state === "device-locked") {
        // Only ever on request. A second phone is normal.
        if (explicit) setView({ kind: "unlock", canUsePassword: now.canUsePassword });
      } else if (now.state === "unavailable") {
        if (explicit) toast("Couldn't reach the server. Try again in a moment.", "error");
      } else if (explicit) {
        toast("Encrypted messaging is already on.", "plain");
      }
    },
    [userId, toast],
  );

  useEffect(() => {
    if (!E2EE_ENABLED) return;
    const timer = setTimeout(() => void route(false), FIRST_LOOK_MS);
    const onOpen = () => void route(true);
    window.addEventListener(E2EE_OPEN_SETUP, onOpen);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(E2EE_OPEN_SETUP, onOpen);
    };
  }, [route]);

  const close = useCallback(() => {
    setView(IDLE);
    setError(null);
  }, []);

  async function start(finishing: boolean) {
    setBusy(true);
    setError(null);
    try {
      if (finishing) {
        const code = await reissueRecoveryCode(userId);
        if (code) return setView({ kind: "code", code });
        // No master key on this device to issue one from — an unusual state.
        // The way forward is to unlock with the code they already have.
        const now = await encryptionState(userId);
        if (now.state === "device-locked") return setView({ kind: "unlock", canUsePassword: now.canUsePassword });
        return setError("Couldn't finish setup on this device.");
      }

      const made = await enroll(userId, null);
      if (made.ok) return setView({ kind: "code", code: made.recoveryCode });

      if (made.reason === "exists") {
        // Another tab or device got there first. Ask again what this one needs.
        const now = await encryptionState(userId);
        if (now.state === "device-locked") return setView({ kind: "unlock", canUsePassword: now.canUsePassword });
        close();
        return;
      }
      setError("Couldn't set up encrypted messaging. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function notNow() {
    writeFlag("local", later(userId));
    close();
  }

  if (view.kind === "code") {
    return (
      <div className="fixed inset-0 z-[120] overflow-y-auto bg-background">
        <div className="mx-auto w-full max-w-[480px]">
          <RecoveryCodeScreen
            code={view.code}
            onDone={async () => {
              if (!(await confirmRecovery(userId))) throw new Error("not confirmed");
              close();
              toast("Encrypted messaging is on.", "success");
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <>
      <BottomSheet
        open={view.kind === "intro"}
        onClose={view.kind === "intro" && view.finishing ? close : notNow}
        title={view.kind === "intro" && view.finishing ? "Finish setting up" : "Protect your private conversations"}
      >
        <div className="flex flex-col gap-4 px-1 pb-2">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15">
            <ShieldCheck size={24} className="text-accent" />
          </span>
          <p className="text-sm leading-relaxed text-muted">
            {view.kind === "intro" && view.finishing
              ? "Encrypted messaging isn't on yet — you haven't saved your recovery code. We'll show you a new one; it takes a minute."
              : "Your private messages can be encrypted so only you and the person you're talking to can read them. Not even Hypefy."}
          </p>
          <p className="text-xs leading-relaxed text-faint">
            You&rsquo;ll get a recovery code to keep. Lose it and this device, and those
            messages can&rsquo;t be recovered by anyone.
          </p>
          {error && <p className="text-xs text-danger">{error}</p>}
          <button
            type="button"
            disabled={busy}
            onClick={() => void start(view.kind === "intro" && view.finishing)}
            className="h-12 rounded-xl bg-accent text-sm font-bold text-accent-ink transition active:scale-[0.99] disabled:opacity-50"
          >
            {busy ? "Setting up…" : view.kind === "intro" && view.finishing ? "Show my new code" : "Set up encrypted messaging"}
          </button>
          <button
            type="button"
            onClick={view.kind === "intro" && view.finishing ? close : notNow}
            className="h-10 text-sm font-semibold text-muted"
          >
            Not now
          </button>
        </div>
      </BottomSheet>

      <UnlockSheet
        // A fresh sheet each time: nothing typed last time may still be in it.
        key={view.kind === "unlock" ? "open" : "closed"}
        open={view.kind === "unlock"}
        canUsePassword={view.kind === "unlock" && view.canUsePassword}
        userId={userId}
        onClose={close}
        onUnlocked={() => {
          close();
          // Unlocking on a device whose vault was never confirmed leaves the
          // same unfinished business; hand it straight to the setup flow.
          void route(false);
          toast("Unlocked. Your messages will now open here.", "success");
        }}
      />
    </>
  );
}

/**
 * Open an existing vault on this device.
 *
 * Password if the vault has a password wrapper and the person has one; the
 * recovery code otherwise. Neither is stored, logged or sent anywhere except
 * into the local key derivation.
 */
function UnlockSheet({
  open,
  canUsePassword,
  userId,
  onClose,
  onUnlocked,
}: {
  open: boolean;
  canUsePassword: boolean;
  userId: string;
  onClose: () => void;
  onUnlocked: () => void;
}) {
  const [useCode, setUseCode] = useState(false);
  const [secret, setSecret] = useState("");
  const [wrong, setWrong] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const byCode = useCode || !canUsePassword;

  async function submit() {
    if (!secret || busy) return;
    setBusy(true);
    setWrong(false);
    try {
      const result = await unlock(userId, { kind: byCode ? "recovery" : "password", secret });
      if (result.ok) {
        setSecret("");
        onUnlocked();
      } else {
        setWrong(true);
        input.current?.focus();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Unlock your messages">
      <form
        className="flex flex-col gap-4 px-1 pb-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15">
          {byCode ? <KeyRound size={22} className="text-accent" /> : <Lock size={22} className="text-accent" />}
        </span>
        <p className="text-sm leading-relaxed text-muted">
          {byCode
            ? "Enter the recovery code you saved when you set up encrypted messaging."
            : "Enter your Hypefy password to open your encrypted messages on this device."}
        </p>
        <input
          ref={input}
          value={secret}
          onChange={(e) => {
            setSecret(e.target.value);
            setWrong(false);
          }}
          type={byCode ? "text" : "password"}
          autoComplete={byCode ? "off" : "current-password"}
          autoCapitalize={byCode ? "characters" : "none"}
          spellCheck={false}
          placeholder={byCode ? "XXXXX-XXXXX-XXXXX-XXXXX" : "Password"}
          className={`input ${byCode ? "font-mono uppercase tracking-wide" : ""}`}
        />
        {wrong && (
          <p className="text-xs text-danger">
            {byCode ? "That code doesn't open your messages." : "That password doesn't open your messages."}
          </p>
        )}
        <button
          type="submit"
          disabled={!secret || busy}
          className="h-12 rounded-xl bg-accent text-sm font-bold text-accent-ink transition active:scale-[0.99] disabled:opacity-50"
        >
          {busy ? "Unlocking…" : "Unlock"}
        </button>
        {canUsePassword && (
          <button
            type="button"
            onClick={() => {
              setUseCode((v) => !v);
              setSecret("");
              setWrong(false);
            }}
            className="h-10 text-sm font-semibold text-muted"
          >
            {byCode ? "Use my password instead" : "Use my recovery code instead"}
          </button>
        )}
        {!canUsePassword && (
          <p className="text-xs leading-relaxed text-faint">
            Signed in with Google or an emailed code? Your recovery code is the way in on a new
            device.
          </p>
        )}
      </form>
    </BottomSheet>
  );
}
