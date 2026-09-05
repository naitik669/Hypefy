"use client";

import { useEffect, useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";

type Step = "idle" | "set" | "confirm" | "remove";

/**
 * Turn the app lock on and off.
 *
 * The PIN never leaves the RPCs: set_lock_pin hashes it, verify_lock_pin is
 * the only comparison, clear_lock_pin demands the current one so an already
 * unlocked session cannot quietly switch the lock off. This screen only ever
 * learns booleans.
 */
export function AppLockSettings() {
  const supabase = createClient();
  const toast = useToast();
  const [has, setHas] = useState<boolean | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [pin, setPin] = useState("");
  const [first, setFirst] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    supabase.rpc("has_lock_pin", { p_scope: "app" }).then(({ data }) => {
      if (live) setHas(data === true);
    });
    return () => {
      live = false;
    };
  }, [supabase]);

  function reset() {
    setStep("idle");
    setPin("");
    setFirst("");
  }

  async function onSubmit() {
    const value = pin.trim();
    if (!/^[0-9]{4,6}$/.test(value)) {
      toast("A PIN is 4 to 6 digits.", "error");
      return;
    }

    if (step === "set") {
      setFirst(value);
      setPin("");
      setStep("confirm");
      return;
    }

    if (step === "confirm") {
      if (value !== first) {
        toast("Those didn't match. Start again.", "error");
        reset();
        setStep("set");
        return;
      }
      setBusy(true);
      const { error } = await supabase.rpc("set_lock_pin", {
        p_scope: "app",
        p_pin: value,
      });
      setBusy(false);
      if (error) {
        toast(error.message, "error");
        return;
      }
      setHas(true);
      reset();
      toast("App lock on", "success");
      return;
    }

    if (step === "remove") {
      setBusy(true);
      const { error } = await supabase.rpc("clear_lock_pin", {
        p_scope: "app",
        p_current_pin: value,
      });
      setBusy(false);
      if (error) {
        // "Incorrect PIN" comes straight from the RPC, as does the rate limit.
        toast(error.message, "error");
        return;
      }
      setHas(false);
      reset();
      toast("App lock off", "success");
    }
  }

  if (has === null) return null;

  return (
    <section>
      <p className="mb-1 px-1 text-xs font-bold uppercase tracking-widest text-faint">
        App lock
      </p>

      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-start gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              has ? "bg-accent/15 text-accent" : "bg-elevated text-muted"
            }`}
          >
            {has ? <ShieldCheck size={19} /> : <Lock size={19} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {has ? "PIN required to open Hypefy" : "No PIN set"}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              Asks for a 4–6 digit PIN when you open the app, and again after
              it&apos;s been in the background a while. This keeps someone
              holding your unlocked phone out — it is not encryption, and it
              doesn&apos;t protect anything from us or from Hypefy&apos;s servers.
            </p>
          </div>
        </div>

        {step === "idle" ? (
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setStep("set")}
              className="h-9 flex-1 rounded-pill bg-accent text-xs font-bold text-accent-ink transition-transform active:scale-[0.98]"
            >
              {has ? "Change PIN" : "Set a PIN"}
            </button>
            {has && (
              <button
                type="button"
                onClick={() => setStep("remove")}
                className="h-9 flex-1 rounded-pill border border-border text-xs font-bold text-muted transition-colors hover:text-foreground"
              >
                Turn off
              </button>
            )}
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            <label className="text-xs font-semibold text-muted">
              {step === "set"
                ? "New PIN"
                : step === "confirm"
                  ? "Confirm your new PIN"
                  : "Enter your current PIN"}
            </label>
            <input
              autoFocus
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && void onSubmit()}
              className="h-11 rounded-xl border border-border bg-elevated px-3 tracking-[0.4em] outline-none focus:border-white/25"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void onSubmit()}
                disabled={busy || pin.length < 4}
                className="h-9 flex-1 rounded-pill bg-accent text-xs font-bold text-accent-ink transition-transform active:scale-[0.98] disabled:opacity-50"
              >
                {step === "remove" ? "Turn off" : "Continue"}
              </button>
              <button
                type="button"
                onClick={reset}
                className="h-9 flex-1 rounded-pill border border-border text-xs font-bold text-muted transition-colors hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
