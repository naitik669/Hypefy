"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HypeMascot } from "@/components/mascot/HypeMascot";

/**
 * Hypefy onboarding — a single, calm brand moment.
 * One coordinated entrance (snappy stagger), balanced vertical rhythm,
 * mascot sits in a glowing disc so it never looks like a floating blob.
 */
export default function OnboardingPage() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 60);
    return () => clearTimeout(t);
  }, []);

  // Small staggered rise — quick, not draggy.
  const rise = (i: number) => ({
    opacity: ready ? 1 : 0,
    transform: ready ? "translateY(0)" : "translateY(14px)",
    transition: `opacity 0.55s cubic-bezier(0.16,1,0.3,1) ${i * 90}ms, transform 0.55s cubic-bezier(0.16,1,0.3,1) ${i * 90}ms`,
  });

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-[480px] flex-col overflow-hidden bg-background px-6">
      {/* Ambient glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        <div className="animate-drift absolute -left-24 -top-24 h-[380px] w-[380px] rounded-full bg-accent/15 blur-[120px]" />
        <div className="animate-drift-slow absolute -right-24 top-1/4 h-72 w-72 rounded-full bg-violet-600/15 blur-[120px]" />
      </div>

      {/* Hero — centered with balanced rhythm */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center text-center">
        {/* Mascot in a glowing disc */}
        <div style={rise(0)} className="relative mb-9">
          <div
            aria-hidden
            className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/15 blur-2xl"
          />
          <div className="relative flex h-32 w-32 items-center justify-center rounded-full border border-white/5 bg-white/[0.03]">
            <HypeMascot mood="welcome" size="md" animated />
          </div>
        </div>

        {/* Wordmark */}
        <h1 style={rise(1)} className="text-6xl font-extrabold tracking-tight text-foreground">
          Hypefy<span className="text-accent">.</span>
        </h1>

        {/* Tagline */}
        <p style={rise(2)} className="mt-3 max-w-[280px] text-base font-medium leading-relaxed text-muted">
          Where your personality lives — posts, shots, hypes, and your people.
        </p>
      </div>

      {/* CTA pinned at the bottom */}
      <div
        style={rise(3)}
        className="relative z-10 flex w-full flex-col items-center gap-3 pb-10"
      >
        <Link
          href="/signup"
          className="flex h-14 w-full items-center justify-center gap-2 rounded-pill bg-accent text-base font-bold text-accent-ink transition-transform active:scale-[0.98]"
        >
          Get Hyped
          <ArrowRight size={20} strokeWidth={2.6} />
        </Link>
        <Link
          href="/signin"
          className="text-sm font-medium text-muted transition-colors active:text-foreground"
        >
          Already have an account? <span className="font-semibold text-foreground">Sign in</span>
        </Link>
      </div>
    </main>
  );
}
