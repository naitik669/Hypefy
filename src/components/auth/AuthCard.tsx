"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { HypefyMark } from "@/components/HypefyMark";

type Mode = "signin" | "signup";

const copy = {
  signin: {
    title: "Sign In",
    subtitle: "Please enter your details to sign in.",
    cta: "Sign in",
    googleLabel: "Continue with Google",
    footerText: "Don't have an account?",
    footerLink: "Sign up",
    footerHref: "/signup",
  },
  signup: {
    title: "Create account",
    subtitle: "Join Hypefy — where your personality lives.",
    cta: "Sign up",
    googleLabel: "Continue with Google",
    footerText: "Already have an account?",
    footerLink: "Sign in",
    footerHref: "/signin",
  },
} as const;

export function AuthCard({ mode }: { mode: Mode }) {
  const t = copy[mode];
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push("/home");
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (error) throw error;
        // If email confirmation is on, there's no active session yet —
        // send them to the branded "check your inbox" screen.
        if (data.session) {
          router.push("/home");
          router.refresh();
        } else {
          router.push(`/check-email?email=${encodeURIComponent(email)}`);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setGoogleLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError(error.message);
      setGoogleLoading(false);
    }
    // On success the browser redirects to Google; no further action here.
  }

  return (
    <div className="animate-rise w-full max-w-[360px]">
      {/* Frosted glass card */}
      <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] p-7 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] backdrop-blur-2xl">
        {/* top inner highlight */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"
        />

        {/* Header */}
        <div className="flex flex-col items-center text-center">
          <HypefyMark className="h-9 w-9 text-white" />
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground">
            {t.title}
          </h1>
          <p className="mt-1 text-[13px] text-muted">{t.subtitle}</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            placeholder="Enter your email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 w-full rounded-xl border border-white/5 bg-white/[0.06] px-4 text-sm text-foreground placeholder:text-faint outline-none transition focus:border-accent/40 focus:ring-2 focus:ring-accent/30"
          />
          <input
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            required
            minLength={6}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-12 w-full rounded-xl border border-white/5 bg-white/[0.06] px-4 text-sm text-foreground placeholder:text-faint outline-none transition focus:border-accent/40 focus:ring-2 focus:ring-accent/30"
          />

          {mode === "signin" && (
            <Link
              href="/signin"
              className="-mt-1 self-end text-xs text-muted transition-colors hover:text-foreground"
            >
              Forgot Password?
            </Link>
          )}

          {error && (
            <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 flex h-12 w-full items-center justify-center rounded-xl bg-white text-sm font-semibold text-black transition hover:bg-white/90 active:scale-[0.99] disabled:opacity-60"
          >
            {loading ? "Please wait…" : t.cta}
          </button>
        </form>

        {/* Divider */}
        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-white/10" />
          <span className="text-[11px] font-medium tracking-widest text-faint">
            OR
          </span>
          <span className="h-px flex-1 bg-white/10" />
        </div>

        {/* Google */}
        <button
          type="button"
          onClick={handleGoogle}
          disabled={googleLoading}
          className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-white/5 bg-white/[0.06] text-sm font-medium text-foreground/90 transition hover:bg-white/[0.1] active:scale-[0.99] disabled:opacity-60"
        >
          <GoogleGlyph className="h-[18px] w-[18px]" />
          {googleLoading ? "Redirecting…" : t.googleLabel}
        </button>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-muted">
          {t.footerText}{" "}
          <Link
            href={t.footerHref}
            className="font-semibold text-foreground transition-colors hover:text-accent"
          >
            {t.footerLink}
          </Link>
        </p>
      </div>
    </div>
  );
}

function GoogleGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}
