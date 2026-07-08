"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { HypefyMark } from "@/components/HypefyMark";

/** Second-factor screen: enter the 6-digit code emailed at sign-in. */
export function Verify2StepCard({ email }: { email: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "email" });
    if (error) {
      setLoading(false);
      setError(error.message || "That code didn't work. Try again.");
      return;
    }
    router.push("/home");
    router.refresh();
  }

  async function resend() {
    if (cooldown > 0) return;
    setNotice(null);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    if (error) setError(error.message);
    else { setNotice("New code sent — check your inbox."); setCooldown(30); }
  }

  if (!email) {
    return (
      <div className="w-full max-w-[360px] text-center">
        <p className="text-sm text-muted">Your session expired.</p>
        <Link href="/signin" className="mt-2 inline-block font-semibold text-foreground hover:text-accent">Back to sign in</Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[360px]">
      <div className="animate-rise relative overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] p-7 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] backdrop-blur-2xl">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />

        <div className="flex flex-col items-center text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/15 text-accent">
            <ShieldCheck size={22} />
          </span>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground">Two-step verification</h1>
          <p className="mt-1 text-[13px] text-muted">
            Enter the code we sent to{" "}
            <span className="font-semibold text-foreground">{email}</span>.
          </p>
        </div>

        {notice && (
          <p className="mt-5 rounded-xl border border-accent/20 bg-accent/10 px-3 py-2.5 text-center text-xs font-medium text-accent">{notice}</p>
        )}

        <form onSubmit={verify} className={`flex flex-col gap-3 ${notice ? "mt-3" : "mt-6"}`}>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={10}
            required
            placeholder="Enter code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="h-12 w-full rounded-xl border border-white/5 bg-white/[0.06] px-4 text-center text-lg font-bold tracking-[0.4em] text-foreground placeholder:tracking-normal placeholder:text-faint outline-none transition focus:border-white/25 focus:border-white/25"
          />
          {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
          <button
            type="submit"
            disabled={loading || code.length < 6}
            className="mt-1 flex h-12 w-full items-center justify-center rounded-xl bg-white text-sm font-semibold text-black transition hover:bg-white/90 active:scale-[0.99] disabled:opacity-60"
          >
            {loading ? "Verifying…" : "Verify"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-muted">
          Didn&apos;t get it?{" "}
          <button type="button" onClick={resend} disabled={cooldown > 0} className="font-semibold text-foreground transition-colors hover:text-accent disabled:opacity-60">
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
          </button>
        </p>
        <p className="mt-3 text-center text-xs text-muted">
          <Link href="/signin" className="hover:text-foreground">Back to sign in</Link>
        </p>
      </div>

      <div className="mt-6 flex justify-center opacity-40">
        <HypefyMark className="h-5 w-5 text-white" />
      </div>
    </div>
  );
}
