"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HypeMascot } from "@/components/mascot/HypeMascot";

/**
 * Hypefy onboarding — brand intro moment.
 *
 * Timed animation sequence:
 *   0ms   ambient glow visible
 *   200ms mascot rises in
 *   500ms wordmark fades up
 *   900ms tagline fades in
 *   1400ms CTA appears
 *
 * Stays on one screen. Feature carousel removed — onboarding
 * should feel like a brand moment, not a tutorial slideshow.
 */
export default function OnboardingPage() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setStep(1), 200),   // mascot
      setTimeout(() => setStep(2), 500),   // wordmark
      setTimeout(() => setStep(3), 900),   // tagline
      setTimeout(() => setStep(4), 1400),  // CTA
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-[480px] flex-col items-center justify-between overflow-hidden bg-background px-6 pb-10 pt-16">
      {/* ── Ambient glow background (always visible) ──────── */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        <div className="animate-drift absolute -left-28 -top-28 h-[420px] w-[420px] rounded-full bg-accent/15 blur-[110px]" />
        <div className="animate-drift-slow absolute -right-20 top-1/3 h-80 w-80 rounded-full bg-violet-600/20 blur-[110px]" />
        <div className="animate-drift absolute bottom-8 left-1/4 h-80 w-80 rounded-full bg-fuchsia-500/12 blur-[120px]" />
      </div>

      {/* ── Mascot (step 1) ──────────────────────────────── */}
      <div
        className="relative z-10 flex flex-1 flex-col items-center justify-center gap-8 text-center"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div
          style={{
            opacity: step >= 1 ? 1 : 0,
            transform: step >= 1 ? "translateY(0)" : "translateY(16px)",
            transition: "opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1)",
          }}
        >
          <HypeMascot mood="welcome" size="lg" animated />
        </div>

        {/* ── Wordmark (step 2) ──────────────────────────── */}
        <div
          style={{
            opacity: step >= 2 ? 1 : 0,
            transform: step >= 2 ? "translateY(0) scale(1)" : "translateY(10px) scale(0.97)",
            transition: "opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1)",
          }}
        >
          <h1 className="text-6xl font-extrabold tracking-tight text-foreground">
            Hypefy<span className="text-accent">.</span>
          </h1>
        </div>

        {/* ── Tagline (step 3) ───────────────────────────── */}
        <div
          style={{
            opacity: step >= 3 ? 1 : 0,
            transform: step >= 3 ? "translateY(0)" : "translateY(8px)",
            transition: "opacity 0.65s ease-out 0.05s, transform 0.65s ease-out 0.05s",
          }}
        >
          <p className="max-w-[260px] text-lg font-medium leading-snug text-muted">
            Where your personality lives.
          </p>
        </div>
      </div>

      {/* ── CTA (step 4) ──────────────────────────────────── */}
      <div
        className="relative z-10 flex w-full max-w-sm flex-col gap-3"
        style={{
          opacity: step >= 4 ? 1 : 0,
          transform: step >= 4 ? "translateY(0)" : "translateY(12px)",
          transition: "opacity 0.6s ease-out, transform 0.6s ease-out",
        }}
      >
        <Link
          href="/signup"
          className="flex h-14 w-full items-center justify-center gap-2 rounded-pill bg-accent text-base font-bold text-accent-ink shadow-[0_0_32px_2px_rgba(200,255,0,0.35)] transition-transform active:scale-[0.98]"
        >
          Get Hyped
          <ArrowRight size={20} strokeWidth={2.6} />
        </Link>
        <Link
          href="/signin"
          className="flex h-14 w-full items-center justify-center rounded-pill text-base font-semibold text-muted transition-colors active:text-foreground"
        >
          Sign In
        </Link>
      </div>
    </main>
  );
}
