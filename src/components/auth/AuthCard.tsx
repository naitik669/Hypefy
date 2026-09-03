"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { upsertSavedAccount } from "@/lib/saved-accounts";
import { DateOfBirthPicker } from "@/components/ui/DateOfBirthPicker";
import { isNative } from "@/lib/native";
import { startNativeGoogleSignIn } from "@/lib/native-auth";

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
    subtitle: "Join Hypefy, where your personality lives.",
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
  const [notice, setNotice] = useState<string | null>(null);
  const [otpLoading, setOtpLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Signup-only: age gate + explicit consent (both required to create an account)
  const [dob, setDob] = useState("");
  const [consent, setConsent] = useState(false);
  // ?add=1 — reached via Settings → "Add account". Keeps the existing
  // session saved in the switcher instead of just discarding it.
  const [addMode, setAddMode] = useState(false);

  // Prefill email + show a notice when redirected here (e.g. from signup
  // because the email is already registered). Read from the URL directly
  // so the page can stay static (no useSearchParams Suspense boundary).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const prefill = params.get("email");
    if (prefill) setEmail(prefill);
    if (mode === "signin" && params.get("exists") === "1") {
      setNotice("That email is already registered. Sign in to continue.");
    }
    if (params.get("add") === "1") setAddMode(true);
  }, [mode]);

  // Age from the entered date of birth (null if unset/invalid).
  const age = (() => {
    if (!dob) return null;
    const b = new Date(dob);
    if (Number.isNaN(b.getTime())) return null;
    const now = new Date();
    let a = now.getFullYear() - b.getFullYear();
    const m = now.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
    return a;
  })();
  // Signup can't proceed until the user is 13+ and has accepted the policies.
  const signupBlocked =
    mode === "signup" && (!consent || age === null || age < 13);

  async function saveSessionAsAccount(session: {
    user: { id: string; email?: string | null };
    access_token: string;
    refresh_token: string;
  }) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, display_name, username, avatar_hue, avatar_url")
      .eq("id", session.user.id)
      .maybeSingle();
    upsertSavedAccount({
      userId: session.user.id,
      email: session.user.email ?? "",
      displayName: (profile as any)?.display_name ?? null,
      username: (profile as any)?.username ?? null,
      avatarHue: (profile as any)?.avatar_hue ?? null,
      avatarUrl: (profile as any)?.avatar_url ?? null,
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Adding another account: snapshot whoever's currently signed in
    // before we overwrite the client's active session below.
    const prevSession = addMode
      ? (await supabase.auth.getSession()).data.session
      : null;

    try {
      if (mode === "signin") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;

        // Opt-in 2-step verification: if this account requires an email code,
        // drop the password session and gate behind a one-time code. (Skipped
        // when adding a second account to the switcher.)
        if (!addMode && data.user) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("two_step_enabled")
            .eq("id", data.user.id)
            .maybeSingle();
          if ((prof as any)?.two_step_enabled) {
            // Send the code BEFORE dropping the password session. If the
            // send fails after a signOut the account is unreachable: no
            // session, no code, and a verify screen that can never be
            // satisfied. Failing here still leaves them signed in.
            const { error: otpError } = await supabase.auth.signInWithOtp({
              email,
              options: { shouldCreateUser: false },
            });
            if (otpError) throw otpError;

            await supabase.auth.signOut();
            router.push(`/verify-2step?email=${encodeURIComponent(email)}`);
            return;
          }
        }

        if (addMode) {
          if (prevSession) await saveSessionAsAccount(prevSession);
          if (data.session) await saveSessionAsAccount(data.session);
        }
        router.push("/home");
        router.refresh();
      } else {
        // Age gate + consent — must pass before we create the account.
        if (age === null || age < 13) {
          setError("You must be at least 13 years old to use Hypefy.");
          setLoading(false);
          return;
        }
        if (!consent) {
          setError(
            "Please accept the Terms, Privacy Policy, and Community Guidelines."
          );
          setLoading(false);
          return;
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: { date_of_birth: dob, age_confirmed: true },
          },
        });
        if (error) {
          // Confirmations off: Supabase returns an explicit error.
          if (
            /already registered|already exists|already in use/i.test(
              error.message
            )
          ) {
            router.push(
              `/signin?exists=1&email=${encodeURIComponent(email)}${
                addMode ? "&add=1&view=form" : ""
              }`
            );
            return;
          }
          throw error;
        }
        // Confirmations on: Supabase hides existing emails (enumeration
        // protection) by returning a user with an empty identities array.
        if (data.user && (data.user.identities?.length ?? 0) === 0) {
          router.push(
            `/signin?exists=1&email=${encodeURIComponent(email)}${
              addMode ? "&add=1&view=form" : ""
            }`
          );
          return;
        }
        // New account. If a session exists, go straight to setup; otherwise
        // confirmation is required — show the branded "check your inbox" screen.
        if (data.session) {
          if (addMode) {
            if (prevSession) await saveSessionAsAccount(prevSession);
            await saveSessionAsAccount(data.session);
          }
          router.push("/setup-profile");
          router.refresh();
        } else {
          // No session yet (email confirmation pending) — restore whoever
          // was signed in so they aren't logged out while waiting.
          if (addMode && prevSession) {
            await supabase.auth.setSession({
              access_token: prevSession.access_token,
              refresh_token: prevSession.refresh_token,
            });
          }
          router.push(`/check-email?email=${encodeURIComponent(email)}`);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Passwordless sign-in: email a one-time code instead of asking for a
   * password. Shares the verify screen with two-step, since from that
   * screen on the two flows are identical — enter the code, get a session.
   *
   * shouldCreateUser stays false so this cannot quietly mint an account
   * for a mistyped address; unknown emails are turned away by Supabase.
   */
  async function handleEmailCode() {
    setError(null);
    setNotice(null);
    if (!email.trim()) {
      setError("Enter your email above, then ask for a code.");
      return;
    }

    setOtpLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    });
    setOtpLoading(false);

    if (error) {
      setError(error.message);
      return;
    }
    router.push(
      `/verify-2step?email=${encodeURIComponent(email.trim())}&reason=otp`
    );
  }

  async function handleForgotPassword() {
    setError(null);
    setNotice(null);
    if (!email.trim()) {
      setError("Enter your email above, then tap Forgot Password.");
      return;
    }
    // The callback exchanges the recovery code and then forwards to `next`.
    // Without it the link lands on "/" — signed in, password unchanged,
    // which is the whole reason reset appeared to do nothing.
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    if (error) setError(error.message);
    else setNotice("Password reset link sent, check your inbox.");
  }

  async function handleGoogle() {
    setError(null);
    // Same age + consent gate applies to Google sign-up.
    if (mode === "signup") {
      if (age === null || age < 13) {
        setError("You must be at least 13 years old to use Hypefy.");
        return;
      }
      if (!consent) {
        setError(
          "Please accept the Terms, Privacy Policy, and Community Guidelines."
        );
        return;
      }
    }
    setGoogleLoading(true);

    // In the native shell Google rejects the WebView, so the consent screen
    // has to open in a real browser and come back via a deep link.
    if (isNative()) {
      const message = await startNativeGoogleSignIn(supabase);
      if (message) {
        setError(message);
        setGoogleLoading(false);
      }
      // Otherwise NativeShell finishes the flow when the deep link arrives.
      return;
    }

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
    <div className="w-full max-w-[360px]">
      {/* Frosted glass card */}
      <div className="animate-rise relative overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] p-7 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] backdrop-blur-2xl">
        {/* top inner highlight */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"
        />

        {/* Header. The wordmark is a brand stamp, not a title — it stays small
            and recessive so the task ("Create account") is what reads first. */}
        <div className="flex flex-col items-center text-center">
          <span className="text-[15px] font-extrabold tracking-tight text-foreground/60">
            Hypefy<span className="text-accent">.</span>
          </span>
          <h1 className="mt-5 text-[26px] font-extrabold leading-none tracking-tight text-foreground">
            {t.title}
          </h1>
          <p className="mt-2 text-[13px] text-muted">
            {addMode
              ? mode === "signin"
                ? "Log in to an existing account to switch between profiles."
                : "Set up a new account to add to your switcher."
              : t.subtitle}
          </p>
        </div>

        {/* Notice (e.g. redirected from signup — email already registered) */}
        {notice && (
          <p className="mt-5 rounded-xl border border-accent/20 bg-accent/10 px-3 py-2.5 text-center text-xs font-medium text-accent">
            {notice}
          </p>
        )}

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className={`flex flex-col gap-3 ${notice ? "mt-3" : "mt-6"}`}
        >
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            placeholder="Enter your email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 w-full rounded-xl border border-white/5 bg-white/[0.06] px-4 text-sm text-foreground placeholder:text-faint outline-none transition focus:border-white/25 focus:border-white/25"
          />
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              autoComplete={
                mode === "signin" ? "current-password" : "new-password"
              }
              required
              minLength={6}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 w-full rounded-xl border border-white/5 bg-white/[0.06] pl-4 pr-11 text-sm text-foreground placeholder:text-faint outline-none transition focus:border-white/25 focus:border-white/25"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-faint transition-colors hover:text-foreground"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {mode === "signin" && (
            <div className="-mt-1 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleEmailCode}
                disabled={otpLoading}
                className="text-xs text-muted transition-colors hover:text-foreground disabled:opacity-60"
              >
                {otpLoading ? "Sending code…" : "Email me a code instead"}
              </button>
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-xs text-muted transition-colors hover:text-foreground"
              >
                Forgot Password?
              </button>
            </div>
          )}

          {mode === "signup" && (
            <>
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="dob"
                  className="text-[11px] font-medium text-muted"
                >
                  Date of birth
                </label>
                <DateOfBirthPicker id="dob" value={dob} onChange={setDob} />
              </div>
              {age !== null && age < 13 && (
                <p className="text-[11px] text-danger">
                  You must be at least 13 years old to use Hypefy.
                </p>
              )}
              <label className="flex items-start gap-2 text-[11px] leading-relaxed text-faint">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
                />
                <span>
                  I am 13 or older and agree to the{" "}
                  <Link href="/terms" className="underline hover:text-muted">
                    Terms
                  </Link>
                  ,{" "}
                  <Link href="/privacy" className="underline hover:text-muted">
                    Privacy Policy
                  </Link>
                  , and{" "}
                  <Link
                    href="/guidelines"
                    className="underline hover:text-muted"
                  >
                    Community Guidelines
                  </Link>
                  .
                </span>
              </label>
            </>
          )}

          {error && (
            <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || signupBlocked}
            className="mt-1 flex h-12 w-full items-center justify-center rounded-xl bg-white text-sm font-semibold text-black transition hover:bg-white/90 active:scale-[0.99] disabled:opacity-60"
          >
            {loading ? "Please wait…" : t.cta}
          </button>
        </form>

        {/* Google — skipped when adding an account: its full-page OAuth
            redirect can't safely snapshot the session being switched from */}
        {!addMode && (
          <>
            <div className="my-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-white/10" />
              <span className="text-[11px] font-medium tracking-widest text-faint">
                OR
              </span>
              <span className="h-px flex-1 bg-white/10" />
            </div>
            <button
              type="button"
              onClick={handleGoogle}
              disabled={googleLoading || signupBlocked}
              className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-white/5 bg-white/[0.06] text-sm font-medium text-foreground/90 transition hover:bg-white/[0.1] active:scale-[0.99] disabled:opacity-60"
            >
              <GoogleGlyph className="h-[18px] w-[18px]" />
              {googleLoading ? "Redirecting…" : t.googleLabel}
            </button>
          </>
        )}

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-muted">
          {t.footerText}{" "}
          <Link
            href={`${t.footerHref}${addMode ? "?add=1&view=form" : ""}`}
            className="font-semibold text-foreground transition-colors hover:text-accent"
          >
            {t.footerLink}
          </Link>
        </p>
        {addMode && (
          <p className="mt-3 text-center text-xs text-muted">
            <Link href="/settings" className="hover:text-foreground">
              Cancel
            </Link>
          </p>
        )}
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
