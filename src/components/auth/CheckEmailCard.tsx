"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export function CheckEmailCard({ email }: { email: string }) {
  const supabase = createClient();
  const [cooldown, setCooldown] = useState(0);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  async function resend() {
    if (cooldown > 0 || status === "sending" || !email) return;
    setStatus("sending");
    setErrorMsg(null);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
    } else {
      setStatus("sent");
      setCooldown(30);
    }
  }

  return (
    <div className="animate-rise w-full max-w-[360px]">
      <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] p-7 text-center shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] backdrop-blur-2xl">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"
        />

        {/* Animated mail */}
        <MailAnimation />

        <h1 className="mt-6 text-2xl font-bold tracking-tight text-foreground">
          Check your inbox
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          We just dropped a confirmation link to
          {email ? (
            <>
              {" "}
              <span className="font-semibold text-foreground">{email}</span>.
            </>
          ) : (
            " your email."
          )}{" "}
          Tap it and your hype begins. ⚡
        </p>

        {/* Status line */}
        {status === "sent" && (
          <p className="mt-4 rounded-lg bg-accent/10 px-3 py-2 text-xs text-accent">
            Sent again — check your inbox (and spam).
          </p>
        )}
        {status === "error" && (
          <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
            {errorMsg ?? "Couldn't resend right now."}
          </p>
        )}

        {/* Resend */}
        <button
          type="button"
          onClick={resend}
          disabled={cooldown > 0 || status === "sending"}
          className="mt-6 flex h-12 w-full items-center justify-center rounded-xl bg-white text-sm font-semibold text-black transition hover:bg-white/90 active:scale-[0.99] disabled:opacity-50"
        >
          {status === "sending"
            ? "Sending…"
            : cooldown > 0
              ? `Resend in ${cooldown}s`
              : "Resend email"}
        </button>

        <p className="mt-5 text-center text-xs text-muted">
          Wrong email?{" "}
          <Link
            href="/signup"
            className="font-semibold text-foreground transition-colors hover:text-accent"
          >
            Go back
          </Link>
        </p>
      </div>

      <p className="mt-5 text-center text-xs text-faint">
        Already confirmed?{" "}
        <Link
          href="/signin"
          className="font-medium text-muted transition-colors hover:text-foreground"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}

function MailAnimation() {
  return (
    <div className="relative mx-auto flex h-28 w-28 items-center justify-center">
      {/* Lime glow */}
      <div
        aria-hidden
        className="animate-glow-pulse absolute h-24 w-24 rounded-full bg-accent/30 blur-2xl"
      />

      {/* Sparkles */}
      <span className="animate-twinkle absolute left-1 top-3 text-accent [animation-delay:0.2s]">
        ✦
      </span>
      <span className="animate-twinkle absolute right-2 top-6 text-hype [animation-delay:0.9s]">
        ✦
      </span>
      <span className="animate-twinkle absolute bottom-3 right-3 text-accent [animation-delay:1.4s]">
        ✦
      </span>

      {/* Envelope */}
      <div className="animate-float-y relative">
        <svg width="84" height="84" viewBox="0 0 84 84" fill="none" aria-hidden>
          {/* body */}
          <rect
            x="10"
            y="24"
            width="64"
            height="46"
            rx="10"
            fill="#1e1e1e"
            stroke="#2a2a2a"
            strokeWidth="2"
          />
          {/* flap */}
          <path
            d="M12 30 L42 50 L72 30"
            stroke="#3a3a3a"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>

        {/* Letter + Hype star rising out of the envelope */}
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <div className="flex h-9 w-12 items-center justify-center rounded-md bg-white shadow-lg">
            <svg
              className="animate-star-pop"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="#ffd000"
              aria-hidden
            >
              <path d="M12 2.5l2.7 6.1 6.6.6-5 4.4 1.5 6.5L12 17.3 6.2 20.6l1.5-6.5-5-4.4 6.6-.6L12 2.5z" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
