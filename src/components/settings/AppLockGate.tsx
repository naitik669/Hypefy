"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Delete, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/** Per-tab, so closing the tab always re-locks. */
const UNLOCKED_KEY = "hypefy.applock.unlocked";
/** How long the app may sit in the background before it locks again. */
const GRACE_MS = 60_000;

function unlocked(): boolean {
  try {
    return sessionStorage.getItem(UNLOCKED_KEY) === "1";
  } catch {
    return false;
  }
}
function setUnlocked(on: boolean) {
  try {
    if (on) sessionStorage.setItem(UNLOCKED_KEY, "1");
    else sessionStorage.removeItem(UNLOCKED_KEY);
  } catch {
    /* private mode — the gate just asks again */
  }
}

/**
 * App lock.
 *
 * Migration 0031 shipped a complete PIN backend — bcrypt hashes behind
 * SECURITY DEFINER RPCs, rate limiting, a table PostgREST cannot even query —
 * and `src/` referenced none of it. This is the front half.
 *
 * It fails OPEN on purpose. The migration is explicit that this is a
 * shoulder-surfing deterrent and not encryption, so a network blip must not
 * be able to lock someone out of their own app with no way through. Anything
 * that must not be readable is protected by RLS, not by this.
 */
export function AppLockGate() {
  const [armed, setArmed] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const hasPin = useRef(false);
  const hiddenAt = useRef<number | null>(null);

  // Does this account have an app PIN at all? One boolean; never the hash.
  useEffect(() => {
    let live = true;
    (async () => {
      const supabase = createClient();
      const { data, error: err } = await supabase.rpc("has_lock_pin", {
        p_scope: "app",
      });
      if (!live || err) return; // fail open
      hasPin.current = data === true;
      if (hasPin.current && !unlocked()) setArmed(true);
    })();
    return () => {
      live = false;
    };
  }, []);

  // Re-lock after the app has been away long enough. Immediately would fire on
  // every notification glance; never would make the lock decorative.
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        return;
      }
      const away = hiddenAt.current ? Date.now() - hiddenAt.current : 0;
      hiddenAt.current = null;
      if (hasPin.current && away > GRACE_MS) {
        setUnlocked(false);
        setArmed(true);
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const submit = useCallback(async (value: string) => {
    setChecking(true);
    const supabase = createClient();
    const { data, error: err } = await supabase.rpc("verify_lock_pin", {
      p_scope: "app",
      p_pin: value,
    });
    setChecking(false);
    setPin("");
    if (err) {
      // The RPC rate-limits before comparing, so this is usually "too many
      // attempts" — say what it said rather than "wrong PIN".
      setError(err.message);
      return;
    }
    if (data === true) {
      setUnlocked(true);
      setArmed(false);
      setError(null);
    } else {
      setError("Wrong PIN");
    }
  }, []);

  function press(digit: string) {
    if (checking) return;
    setError(null);
    const next = (pin + digit).slice(0, 6);
    setPin(next);
    // 4 is the minimum the RPC accepts; longer PINs need Enter.
    if (next.length === 6) void submit(next);
  }

  if (!armed) return null;

  return (
    <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center gap-6 bg-background px-8">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface text-accent">
        <Lock size={24} />
      </div>
      <div className="text-center">
        <h1 className="text-lg font-bold">Hypefy is locked</h1>
        <p className="mt-1 text-sm text-muted">Enter your PIN to carry on.</p>
      </div>

      <div className="flex h-6 items-center gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <span
            key={i}
            className={`h-2.5 w-2.5 rounded-full transition-colors ${
              i < pin.length ? "bg-accent" : "bg-surface"
            }`}
          />
        ))}
      </div>

      <p className="h-4 text-xs font-semibold text-danger">{error ?? ""}</p>

      <div className="grid w-full max-w-[260px] grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => press(d)}
            className="h-14 rounded-2xl bg-surface text-xl font-semibold transition-transform active:scale-95"
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          onClick={() => pin.length >= 4 && void submit(pin)}
          disabled={pin.length < 4 || checking}
          className="h-14 rounded-2xl bg-surface text-xs font-bold text-muted transition-transform active:scale-95 disabled:opacity-40"
        >
          Enter
        </button>
        <button
          type="button"
          onClick={() => press("0")}
          className="h-14 rounded-2xl bg-surface text-xl font-semibold transition-transform active:scale-95"
        >
          0
        </button>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setPin((p) => p.slice(0, -1));
          }}
          aria-label="Delete"
          className="flex h-14 items-center justify-center rounded-2xl bg-surface text-muted transition-transform active:scale-95"
        >
          <Delete size={20} />
        </button>
      </div>
    </div>
  );
}
