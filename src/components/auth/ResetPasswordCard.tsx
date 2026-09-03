"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * Sets a new password at the end of the recovery flow.
 *
 * The reset email used to point straight at /auth/callback, which exchanged
 * the code and forwarded to "/". That signed the person in — with the old
 * password still in place and no screen anywhere that could change it. The
 * link "worked" and the password never moved, which is exactly what a
 * broken reset feels like from the outside.
 *
 * The recovery code is already spent by the time this renders: the callback
 * exchanged it for a session, so all that is left is updateUser(). If that
 * session is missing the link was stale or already used, and saying so is
 * more useful than a failing form.
 */
export function ResetPasswordCard() {
  const supabase = createClient();
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setAuthed(!!data.session);
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }

    setSaving(true);
    setError(null);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    setDone(true);
    // Straight into the app — updateUser leaves the session signed in, so
    // bouncing back to /signin would only ask for the password just set.
    setTimeout(() => {
      router.push("/home");
      router.refresh();
    }, 1200);
  }

  const shell =
    "animate-rise relative overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] p-7 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] backdrop-blur-2xl";

  if (checking) {
    return (
      <div className={shell}>
        <p className="text-center text-sm text-muted">Checking your link…</p>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className={shell}>
        <h1 className="text-[22px] font-extrabold tracking-tight">
          Link expired<span className="text-accent">.</span>
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Reset links can only be opened once, and they run out after an hour.
          Ask for a fresh one and it&rsquo;ll work.
        </p>
        <Link
          href="/signin"
          className="mt-6 flex h-12 w-full items-center justify-center rounded-xl bg-white text-sm font-semibold text-black transition hover:bg-white/90"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className={shell}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"
      />

      <div className="flex flex-col items-center text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/15 text-accent">
          <KeyRound size={22} />
        </span>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground">
          Set a new password
        </h1>
        <p className="mt-1 text-[13px] text-muted">
          Pick something you haven&rsquo;t used here before.
        </p>
      </div>

      {done ? (
        <p className="mt-6 rounded-xl border border-accent/20 bg-accent/10 px-3 py-2.5 text-center text-xs font-medium text-accent">
          Password updated. Taking you in…
        </p>
      ) : (
        <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
          <label htmlFor="new-password" className="sr-only">
            New password
          </label>
          <div className="relative">
            <input
              id="new-password"
              type={show ? "text" : "password"}
              required
              autoFocus
              autoComplete="new-password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 w-full rounded-xl border border-white/5 bg-white/[0.06] px-4 pr-11 text-base text-foreground outline-none transition placeholder:text-faint focus:border-white/25"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? "Hide password" : "Show password"}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-faint transition hover:text-foreground"
            >
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <label htmlFor="confirm-password" className="sr-only">
            Confirm new password
          </label>
          <input
            id="confirm-password"
            type={show ? "text" : "password"}
            required
            autoComplete="new-password"
            placeholder="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="h-12 w-full rounded-xl border border-white/5 bg-white/[0.06] px-4 text-base text-foreground outline-none transition placeholder:text-faint focus:border-white/25"
          />

          {error ? (
            <p
              role="alert"
              className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger"
            >
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={saving || !password || !confirm}
            className="mt-1 flex h-12 w-full items-center justify-center rounded-xl bg-white text-sm font-semibold text-black transition hover:bg-white/90 active:scale-[0.99] disabled:opacity-60"
          >
            {saving ? "Saving…" : "Update password"}
          </button>
        </form>
      )}
    </div>
  );
}
