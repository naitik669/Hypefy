"use client";

import { useState } from "react";

/**
 * Invite-code entry. Same frosted card as AuthCard so the wall reads as
 * part of Hypefy rather than a hosting-provider interstitial.
 *
 * Two ways out, weighted deliberately. The QR on hypefy.chat now points
 * here, so most people meeting this card arrive without a code — the
 * waitlist is a full second action rather than a link inside a sentence,
 * because for that majority it is the only door that opens.
 */
export function GateCard() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "That code is not valid.");
        setBusy(false);
        return;
      }

      // Full reload rather than router.push: the gate cookie has to be
      // present on the next request for the proxy to let it through.
      //
      // Back to the URL that was asked for, not "/". The proxy REWRITES to
      // /gate instead of redirecting exactly so the address bar still holds
      // the intended destination — sending everyone to the feed threw that
      // away, so following a link into the app (add-account, a shared post)
      // landed on home and read as that feature being broken.
      const intended = window.location.pathname + window.location.search;
      window.location.replace(intended.startsWith("/gate") ? "/" : intended);
    } catch {
      setError("Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <div className="animate-rise relative overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] p-7 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] backdrop-blur-2xl">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"
      />

      <span className="text-[15px] font-extrabold tracking-tight text-foreground/60">
        Hypefy<span className="text-accent">.</span>
      </span>

      <h1 className="mt-5 text-[22px] font-extrabold tracking-tight">
        Invite only<span className="text-accent">.</span>
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Hypefy isn&rsquo;t open to everyone yet. Enter your invite code to get
        in, or join the waitlist and we&rsquo;ll email you the day it opens.
      </p>

      <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
        <label htmlFor="invite-code" className="sr-only">
          Invite code
        </label>
        <input
          id="invite-code"
          type="text"
          required
          autoFocus
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="Invite code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "invite-error" : undefined}
          className="h-12 w-full rounded-xl border border-white/5 bg-white/[0.06] px-4 text-base tracking-widest text-foreground outline-none transition placeholder:tracking-normal placeholder:text-faint focus:border-white/25"
        />

        {error ? (
          <p
            id="invite-error"
            role="alert"
            className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger"
          >
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy || code.trim() === ""}
          className="mt-1 flex h-12 w-full items-center justify-center rounded-xl bg-white text-sm font-semibold text-black transition hover:bg-white/90 active:scale-[0.99] disabled:opacity-60"
        >
          {busy ? "Checking…" : "Continue"}
        </button>
      </form>

      <div aria-hidden className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-white/10" />
        <span className="text-[11px] font-semibold tracking-widest text-faint uppercase">
          No code?
        </span>
        <span className="h-px flex-1 bg-white/10" />
      </div>

      {/*
        The waitlist lives on hypefy.chat, which is a different origin — so
        inside the native shell this leaves the app and opens the system
        browser. That is the right outcome: without a code there is nothing
        here to come back to until launch.
      */}
      <a
        href="https://hypefy.chat"
        className="flex h-12 w-full items-center justify-center rounded-xl border border-white/15 bg-white/[0.03] text-sm font-semibold text-foreground transition hover:bg-white/[0.07] active:scale-[0.99]"
      >
        Join the waitlist
      </a>
    </div>
  );
}
