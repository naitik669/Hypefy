"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Loader2, KeyRound, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * The screen you land on when a session hasn't cleared its second factor.
 *
 * Deliberately in the (auth) group, not (app). Under (app) the layout would
 * redirect an account with no date_of_birth to /age-check, which the MFA gate
 * then bounces straight back here — an unrecoverable loop, and most accounts
 * created before the age-gate migration have no date on record.
 *
 * Carries its own sign-out, too: this session cannot reach /settings/account,
 * so without a button here the only ways out are clearing cookies or knowing
 * the code.
 */
export function Verify2faCard() {
  const supabase = createClient();
  const router = useRouter();

  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [mode, setMode] = useState<"totp" | "recovery">("totp");
  const [recoveryCode, setRecoveryCode] = useState("");

  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data }) => {
      const verified = (data?.all ?? []).find(
        (f) => f.factor_type === "totp" && f.status === "verified",
      );
      setFactorId(verified?.id ?? null);
    });
  }, [supabase]);

  async function verify() {
    if (!factorId || code.length < 6) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: code.trim(),
    });
    setBusy(false);
    if (err) {
      setAttempts((a) => a + 1);
      setError(
        attempts >= 2
          ? "Still no. If your phone's clock is set manually, switch it to automatic — these codes are time-based."
          : "That code didn't match. They change every 30 seconds.",
      );
      setCode("");
      return;
    }
    // The token now carries aal2, so the middleware gate stops firing.
    // A hard navigation, not router.push: the middleware has to re-read the
    // refreshed cookie, and a client-side transition can be served from a
    // payload prefetched while the session was still aal1.
    window.location.href = "/home";
  }

  async function recover() {
    if (!recoveryCode.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/mfa/recover", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: recoveryCode.trim() }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setBusy(false);
      setError(body.error ?? "Couldn't use that code.");
      return;
    }
    // The factor is gone and every session with it. Signing out locally too,
    // so the next screen is a clean sign-in rather than a dead cookie.
    await supabase.auth.signOut();
    window.location.href = "/signin?recovered=1";
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col justify-center px-6 py-10">
      <div className="flex flex-col gap-5">
        <div>
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-[16px] bg-accent/15 text-accent">
            {mode === "totp" ? <ShieldCheck size={24} /> : <KeyRound size={24} />}
          </span>
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight">
            {mode === "totp" ? "Enter your code" : "Lost your authenticator?"}
          </h1>
          <p className="mt-1.5 text-sm leading-snug text-muted">
            {mode === "totp" ? (
              "Open your authenticator app and type the 6-digit code for Hypefy."
            ) : (
              <>
                Enter one of your recovery codes to{" "}
                <strong className="text-foreground">turn two-factor off</strong>.
                You&apos;ll be signed out everywhere and can sign in with just
                your password, then set up a new authenticator.
              </>
            )}
          </p>
        </div>

        {mode === "totp" ? (
          <>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter") verify();
              }}
              placeholder="000000"
              className="w-full rounded-2xl border border-border bg-surface px-4 py-4 text-center font-mono text-2xl tracking-[0.35em] outline-none focus:border-white/25"
            />
            {error && <p className="text-xs text-danger">{error}</p>}
            <button
              type="button"
              onClick={verify}
              disabled={busy || code.length < 6 || !factorId}
              className="flex items-center justify-center gap-2 rounded-2xl bg-accent py-3.5 text-sm font-bold text-accent-ink transition-opacity disabled:opacity-40"
            >
              {busy && <Loader2 size={16} className="animate-spin" />}
              {busy ? "Checking…" : "Continue"}
            </button>
          </>
        ) : (
          <>
            <input
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") recover();
              }}
              placeholder="xxxxx-xxxxx"
              className="w-full rounded-2xl border border-border bg-surface px-4 py-4 text-center font-mono text-lg outline-none focus:border-white/25"
            />
            {error && <p className="text-xs text-danger">{error}</p>}
            <button
              type="button"
              onClick={recover}
              disabled={busy || !recoveryCode.trim()}
              className="flex items-center justify-center gap-2 rounded-2xl bg-accent py-3.5 text-sm font-bold text-accent-ink transition-opacity disabled:opacity-40"
            >
              {busy && <Loader2 size={16} className="animate-spin" />}
              {busy ? "Checking…" : "Turn off two-factor"}
            </button>
          </>
        )}

        <div className="flex flex-col gap-2 pt-1 text-center">
          <button
            type="button"
            onClick={() => {
              setMode(mode === "totp" ? "recovery" : "totp");
              setError(null);
            }}
            className="text-xs font-semibold text-muted underline transition-colors hover:text-foreground"
          >
            {mode === "totp"
              ? "Lost your authenticator? Use a recovery code"
              : "Back to entering a code"}
          </button>
          <button
            type="button"
            onClick={signOut}
            className="flex items-center justify-center gap-1.5 text-xs font-semibold text-faint transition-colors hover:text-muted"
          >
            <ArrowLeft size={13} />
            Sign out and use a different account
          </button>
        </div>
      </div>
    </div>
  );
}
