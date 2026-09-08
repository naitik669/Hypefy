"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ShieldCheck, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/** How long a completed step-up counts for. */
const FRESH_MS = 5 * 60_000;
const STAMP_KEY = "hypefy.stepup.at";

/**
 * "Prove it's you" before something you can't take back.
 *
 * Deleting the account, changing the email, changing the password and turning
 * two-factor off all needed nothing but an open tab. That is the gap an
 * unattended unlocked phone walks through, and none of those four are
 * reversible by the person they happen to.
 *
 * Uses the second factor when there is one, and the password when there isn't,
 * so it works for every account rather than only the careful ones.
 */
export function useStepUp() {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const request = useCallback((opts?: { maxAge?: number }) => {
    const age = opts?.maxAge ?? FRESH_MS;
    // A recent step-up counts again, so changing two settings in a row
    // doesn't mean two challenges. Passing maxAge: 0 opts out — turning 2FA
    // off wants a fresh one, not one from four minutes ago.
    if (age > 0) {
      const at = Number(sessionStorage.getItem(STAMP_KEY) ?? 0);
      if (at && Date.now() - at < age) return Promise.resolve(true);
    }
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const finish = useCallback((ok: boolean) => {
    if (ok) {
      try {
        sessionStorage.setItem(STAMP_KEY, String(Date.now()));
      } catch {
        /* private mode — the worst case is being asked again */
      }
    }
    setOpen(false);
    resolver.current?.(ok);
    resolver.current = null;
  }, []);

  const dialog = open ? (
    <StepUpPrompt supabase={supabase} onDone={finish} />
  ) : null;

  return { requireStepUp: request, stepUpDialog: dialog };
}

function StepUpPrompt({
  supabase,
  onDone,
}: {
  supabase: ReturnType<typeof createClient>;
  onDone: (ok: boolean) => void;
}) {
  const [mode, setMode] = useState<"loading" | "totp" | "password">("loading");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Which challenge to show depends on whether this account has a factor.
  useEffect(() => {
    let live = true;
    supabase.auth.mfa.listFactors().then(({ data }) => {
      if (!live) return;
      const verified = (data?.all ?? []).find(
        (f) => f.factor_type === "totp" && f.status === "verified"
      );
      if (verified) {
        setFactorId(verified.id);
        setMode("totp");
      } else {
        setMode("password");
      }
    });
    return () => {
      live = false;
    };
  }, [supabase]);

  async function submit() {
    if (!value.trim()) return;
    setBusy(true);
    setError(null);

    if (mode === "totp" && factorId) {
      const { error: err } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: value.trim(),
      });
      setBusy(false);
      if (err) {
        setError("That code didn't match.");
        setValue("");
        return;
      }
      onDone(true);
      return;
    }

    // Password path, for accounts with no factor.
    //
    // NOTE: signInWithPassword mints a NEW session, at aal1. That is harmless
    // here precisely because this branch only runs when there is no factor —
    // for an MFA account it would demote the live session and bounce them to
    // the challenge screen mid-action. That is why the branch above exists.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const email = user?.email ?? "";
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password: value,
    });
    setBusy(false);
    if (err) {
      setError("That password isn't right.");
      setValue("");
      return;
    }
    onDone(true);
  }

  const body = (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-[380px] rounded-3xl border border-border bg-elevated p-5 shadow-2xl">
        <div className="mb-4 flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-accent/15 text-accent">
            <ShieldCheck size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">Confirm it&apos;s you</p>
            <p className="mt-0.5 text-xs leading-snug text-muted">
              {mode === "totp"
                ? "Enter the current code from your authenticator app."
                : "Enter your password to continue."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onDone(false)}
            aria-label="Cancel"
            className="shrink-0 rounded-full p-1 text-faint transition-colors hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        {mode === "loading" ? (
          <div className="flex items-center gap-2 py-3 text-sm text-muted">
            <Loader2 size={16} className="animate-spin" />
            Checking…
          </div>
        ) : (
          <>
            <input
              autoFocus
              type={mode === "totp" ? "text" : "password"}
              inputMode={mode === "totp" ? "numeric" : undefined}
              autoComplete={
                mode === "totp" ? "one-time-code" : "current-password"
              }
              maxLength={mode === "totp" ? 6 : undefined}
              value={value}
              onChange={(e) =>
                setValue(
                  mode === "totp"
                    ? e.target.value.replace(/\D/g, "")
                    : e.target.value
                )
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              placeholder={mode === "totp" ? "000000" : "Your password"}
              className={`w-full rounded-xl border border-border bg-surface px-4 py-3 outline-none focus:border-white/25 ${
                mode === "totp"
                  ? "text-center font-mono text-lg tracking-[0.3em]"
                  : "text-sm"
              }`}
            />
            {error && <p className="mt-2 text-xs text-danger">{error}</p>}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => onDone(false)}
                className="flex-1 rounded-xl border border-border py-2.5 text-sm font-bold transition-colors active:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={busy || !value.trim()}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-sm font-bold text-accent-ink transition-opacity disabled:opacity-40"
              >
                {busy && <Loader2 size={15} className="animate-spin" />}
                Confirm
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(body, document.body)
    : null;
}
