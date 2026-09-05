"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarDays, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/** Whole years from a yyyy-mm-dd string, or null if it isn't a real date. */
export function ageFrom(dob: string, today = new Date()): number | null {
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  let years = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) years -= 1;
  return years;
}

/**
 * Asks for a date of birth once, for accounts that arrived without one.
 *
 * Two paths produced those. Google OAuth on the SIGN-IN page ran no age or
 * consent check at all — and Google creates the account if it doesn't exist —
 * and the signup path parked the date in localStorage across the redirect,
 * where an expired TTL or a deep link landing in another browser lost it
 * silently. 15 of 17 existing accounts have no age on record.
 *
 * The value goes through set_date_of_birth (migration 0053), which is
 * write-once and rejects under-13 in the database. This form is the prompt;
 * it is not the gate.
 */
export function AgeCheck() {
  const supabase = createClient();
  const router = useRouter();
  const [dob, setDob] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const age = dob ? ageFrom(dob) : null;
  const blocked = age === null || age < 13 || !consent;

  async function submit() {
    if (blocked || busy) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc("set_date_of_birth", { p_dob: dob });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.replace("/home");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col justify-center gap-6 px-6 py-10">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface text-accent">
        <CalendarDays size={22} />
      </div>

      <div>
        <h1 className="text-xl font-bold tracking-tight">One thing before you carry on</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          We need your date of birth on file. We ask once, we don&apos;t show it on your
          profile, and it can&apos;t be changed afterwards.
        </p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-muted">Date of birth</span>
        <input
          type="date"
          value={dob}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => {
            setDob(e.target.value);
            setError(null);
          }}
          className="h-12 rounded-xl border border-border bg-elevated px-3 text-sm outline-none focus:border-white/25"
        />
      </label>

      {age !== null && age < 13 && (
        <p className="text-xs font-semibold text-danger">
          You must be at least 13 years old to use Hypefy.
        </p>
      )}

      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
        />
        <span className="text-xs leading-relaxed text-muted">
          I accept the{" "}
          <Link href="/terms" className="text-accent underline">Terms</Link>,{" "}
          <Link href="/privacy" className="text-accent underline">Privacy Policy</Link> and{" "}
          <Link href="/guidelines" className="text-accent underline">Community Guidelines</Link>.
        </span>
      </label>

      {error && <p className="text-xs font-semibold text-danger">{error}</p>}

      <button
        type="button"
        onClick={() => void submit()}
        disabled={blocked || busy}
        className="flex h-12 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-bold text-accent-ink transition-transform active:scale-[0.99] disabled:opacity-50"
      >
        {busy && <Loader2 size={16} className="animate-spin" />}
        Continue
      </button>

      <p className="text-center text-[11px] text-faint">
        Signed in as the wrong person?{" "}
        <Link href="/settings/account" className="underline hover:text-muted">
          Account settings
        </Link>
      </p>
    </div>
  );
}
