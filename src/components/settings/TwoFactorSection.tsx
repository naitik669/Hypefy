"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  ShieldOff,
  Loader2,
  AlertTriangle,
  Copy,
  Check,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { RecoveryCodes } from "@/components/settings/RecoveryCodes";
import { removeSavedAccount } from "@/lib/saved-accounts";
import { useStepUp } from "@/components/auth/StepUpDialog";

/**
 * Fixed, so cleanup is deterministic. Supabase rejects a duplicate friendly
 * name, and an abandoned enrollment leaves an unverified factor behind that
 * would block every later attempt with a confusing error.
 */
const FACTOR_NAME = "Authenticator";

type Stage = "loading" | "off" | "enrolling" | "on";

/**
 * Turning on two-factor, for real this time.
 *
 * The old "two-step verification" switch wrote a boolean that exactly one
 * browser `if` ever read — Google sign-in, the account switcher, a direct API
 * call and even a failed code-send all walked straight past it. This enrolls a
 * TOTP factor with Supabase's own MFA, which puts an `aal2` claim in the token
 * itself, so the server can check it and no client can talk its way around it.
 */
export function TwoFactorSection({
  userId,
  recoveryConfigured,
}: {
  userId: string;
  /**
   * Whether the deployment can actually perform a recovery (it needs the
   * service-role key to delete a factor). False means enrollment is refused
   * outright rather than offered as a trap — see the banner below.
   */
  recoveryConfigured: boolean;
}) {
  const supabase = createClient();
  const router = useRouter();
  const toast = useToast();
  const { requireStepUp, stepUpDialog } = useStepUp();

  const [stage, setStage] = useState<Stage>("loading");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  /** Set right after enrolling, so the codes step cannot be walked past. */
  const [mustSaveCodes, setMustSaveCodes] = useState(false);
  const codesRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const { data, error: err } = await supabase.auth.mfa.listFactors();
    if (err) {
      setStage("off");
      return;
    }
    const verified = (data?.all ?? []).find(
      (f) => f.factor_type === "totp" && f.status === "verified"
    );
    if (verified) {
      setFactorId(verified.id);
      setStage("on");
      const { data: n } = await supabase.rpc("mfa_recovery_codes_remaining");
      setRemaining((n as number | null) ?? 0);
    } else {
      setStage("off");
    }
  }, [supabase]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function startEnroll() {
    setBusy(true);
    setError(null);
    setAttempts(0);

    // Clear out anything a previous abandoned attempt left behind. An
    // unverified factor is invisible in the UI but very much present to the
    // API, where it collides with the fixed friendly name.
    const { data: existing } = await supabase.auth.mfa.listFactors();
    for (const f of existing?.all ?? []) {
      if (f.factor_type === "totp" && f.status !== "verified") {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
    }

    const { data, error: err } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: FACTOR_NAME,
      issuer: "Hypefy",
    });
    setBusy(false);
    if (err || !data) {
      setError(err?.message ?? "Couldn't start setup. Try again.");
      return;
    }
    setFactorId(data.id);
    // Supabase hands back the rendered SVG. Re-encoding data.totp.uri with a
    // QR library would just be a second place for the secret to leak.
    setQr(data.totp.qr_code);
    setSecret(data.totp.secret);
    setCode("");
    setStage("enrolling");
  }

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
          ? "Still wrong. If your phone's clock is set manually, switch it to automatic — TOTP codes are time-based."
          : "That code didn't match. Codes change every 30 seconds."
      );
      return;
    }

    // Verifying a first factor signs the user's OTHER sessions out. The saved
    // account entry for this user now holds a dead refresh token, and the
    // switcher would drop it later on a mystery failure — better to drop it
    // here, deliberately.
    removeSavedAccount(userId);

    setStage("on");
    setMustSaveCodes(true);
    setQr(null);
    setSecret(null);
    setCode("");
    setRemaining(0);
    await supabase.rpc("log_security_alert", {
      p_body: "Two-factor authentication was turned on",
    });
    toast("Two-factor is on", "success");
    router.refresh();
    setTimeout(
      () =>
        codesRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        }),
      120
    );
  }

  async function disable() {
    if (!factorId) return;
    // A FRESH challenge, cache bypassed. An already-unlocked browser left on a
    // desk must not be able to switch the second factor off — that is the
    // exact scenario it exists for.
    if (!(await requireStepUp({ maxAge: 0 }))) return;
    setBusy(true);
    const { error: err } = await supabase.auth.mfa.unenroll({ factorId });
    if (err) {
      setBusy(false);
      toast("Couldn't turn it off — try again", "error");
      return;
    }
    await supabase.rpc("clear_mfa_recovery_codes");
    await supabase.rpc("log_security_alert", {
      p_body: "Two-factor authentication was turned off",
    });
    setBusy(false);
    setFactorId(null);
    setRemaining(null);
    setStage("off");
    toast("Two-factor is off", "plain");
    router.refresh();
  }

  if (stage === "loading") {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-elevated p-4 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" />
        Checking…
      </div>
    );
  }

  // Refused rather than offered. Without the service-role key the recovery
  // route cannot delete a factor, so enrolling here would mean a lost phone is
  // a lost account with no way back — the same fail-closed shape the account
  // deletion route uses when the key is missing.
  if (!recoveryConfigured && stage === "off") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-border bg-elevated p-4">
        <span className="mt-0.5 text-faint">
          <AlertTriangle size={18} />
        </span>
        <div>
          <p className="text-sm font-semibold">
            Two-factor isn&apos;t available
          </p>
          <p className="mt-0.5 text-xs text-muted">
            This deployment can&apos;t perform account recovery, so turning
            two-factor on would risk locking you out for good.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {stepUpDialog}
      <div className="flex items-start gap-3 rounded-2xl border border-border bg-elevated p-4">
        <span
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] ${
            stage === "on"
              ? "bg-accent/15 text-accent"
              : "bg-surface text-foreground"
          }`}
        >
          {stage === "on" ? <ShieldCheck size={18} /> : <ShieldOff size={18} />}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            Two-factor authentication
            {stage === "on" && (
              <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-accent">
                On
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs leading-snug text-muted">
            {stage === "on"
              ? "Signing in needs a code from your authenticator app as well as your password."
              : "A code from an authenticator app on top of your password, so a stolen password isn't enough on its own."}
          </p>

          {stage === "off" && (
            <button
              type="button"
              onClick={startEnroll}
              disabled={busy}
              className="mt-3 rounded-xl bg-accent px-4 py-2 text-xs font-bold text-accent-ink transition-transform active:scale-95 disabled:opacity-50"
            >
              {busy ? "Setting up…" : "Turn on"}
            </button>
          )}

          {stage === "on" && (
            <button
              type="button"
              onClick={() => setConfirmOff(true)}
              disabled={busy}
              className="mt-3 rounded-xl border border-border px-4 py-2 text-xs font-bold transition-colors active:bg-white/5 disabled:opacity-50"
            >
              Turn off
            </button>
          )}
        </div>
      </div>

      {stage === "enrolling" && qr && (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-elevated p-4">
          <div>
            <p className="text-sm font-bold">Scan this</p>
            <p className="mt-0.5 text-xs text-muted">
              Open your authenticator app — Google Authenticator, 1Password,
              Authy, whichever you use — and scan the square.
            </p>
          </div>

          {/* White plate on purpose: a QR inverted onto a dark ground fails to
              scan on a good number of phone cameras. */}
          <div className="mx-auto rounded-xl bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:image/svg+xml;utf-8,${qr}`}
              alt="Two-factor setup QR code"
              width={168}
              height={168}
              className="h-[168px] w-[168px]"
            />
          </div>

          {secret && (
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(secret).then(() => {
                  setCopiedSecret(true);
                  setTimeout(() => setCopiedSecret(false), 2000);
                });
              }}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface py-2 text-[11px] font-semibold text-muted transition-colors active:bg-white/5"
            >
              {copiedSecret ? <Check size={13} /> : <Copy size={13} />}
              {copiedSecret ? "Key copied" : "Can't scan? Copy the setup key"}
            </button>
          )}

          <div>
            <label
              htmlFor="mfa-code"
              className="text-xs font-semibold text-muted"
            >
              Then enter the 6-digit code it shows
            </label>
            <input
              id="mfa-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter") verify();
              }}
              placeholder="000000"
              className="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-3 text-center font-mono text-lg tracking-[0.3em] outline-none focus:border-white/25"
            />
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}

          <p className="text-[11px] leading-snug text-faint">
            Turning this on signs you out on your other devices.
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setStage("off");
                setQr(null);
                setSecret(null);
                setError(null);
              }}
              className="flex-1 rounded-xl border border-border py-2.5 text-sm font-bold transition-colors active:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={verify}
              disabled={busy || code.length < 6}
              className="flex-1 rounded-xl bg-accent py-2.5 text-sm font-bold text-accent-ink transition-opacity disabled:opacity-40"
            >
              {busy ? "Checking…" : "Confirm"}
            </button>
          </div>
        </div>
      )}

      {stage === "on" && (
        <div ref={codesRef}>
          {remaining === 0 && !mustSaveCodes && (
            <div className="mb-3 flex items-start gap-2.5 rounded-2xl border border-danger/40 bg-danger/[0.07] p-3.5">
              <span className="mt-0.5 shrink-0 text-danger">
                <AlertTriangle size={16} />
              </span>
              <p className="text-xs leading-snug">
                <span className="font-bold">No recovery codes.</span> If you
                lose your authenticator you will not be able to get back in.
                Generate a set now.
              </p>
            </div>
          )}
          <RecoveryCodes
            remaining={remaining}
            onRemainingChange={setRemaining}
            onAcknowledged={() => setMustSaveCodes(false)}
          />
        </div>
      )}

      <ConfirmDialog
        open={confirmOff}
        onClose={() => setConfirmOff(false)}
        onConfirm={disable}
        title="Turn off two-factor?"
        body="Your password alone will be enough to sign in again, and your recovery codes stop working."
        confirmLabel="Turn off"
        danger
      />
    </div>
  );
}
