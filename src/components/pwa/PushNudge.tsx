"use client";

import { useEffect, useState } from "react";
import { BellRing, X, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";
import { pushSupported, getPushSubscription, subscribeToPush } from "@/lib/push";

const SNOOZE_KEY = "hypefy_push_snooze";
const SNOOZE_DAYS = 14;

/**
 * Contextual push pitch on the notifications page — someone checking their
 * notifications is exactly who wants pings. Shows only when push is possible
 * but not yet set up: supported browser, permission not denied, no existing
 * subscription, not snoozed. Dismiss snoozes for two weeks.
 */
export function PushNudge() {
  const supabase = createClient();
  const toast = useToast();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pushSupported()) return;
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return;
    if (Notification.permission === "denied") return;
    try {
      const snoozedAt = Number(localStorage.getItem(SNOOZE_KEY) ?? "0");
      if (Date.now() - snoozedAt < SNOOZE_DAYS * 86_400_000) return;
    } catch {
      return;
    }
    getPushSubscription().then((sub) => {
      if (!sub) setVisible(true);
    });
  }, []);

  function snooze() {
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now())); } catch {}
    setVisible(false);
  }

  async function enable() {
    if (busy) return;
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(false); return; }
    const result = await subscribeToPush(supabase, user.id);
    setBusy(false);
    if (result === "subscribed") {
      toast("Push is on, you'll get pinged", "success");
      setVisible(false);
    } else if (result === "denied") {
      toast("Notifications are blocked in your browser", "error");
      snooze();
    } else {
      toast("Couldn't turn on push, try again later", "error");
    }
  }

  if (!visible) return null;

  return (
    <div className="animate-row-in mx-4 mt-3 flex items-center gap-3 rounded-2xl border border-border bg-surface px-3.5 py-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
        <BellRing size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold leading-tight">
          Never miss these<span className="text-accent">.</span>
        </p>
        <p className="truncate text-xs text-muted">Get hypes and replies even when Hypefy is closed.</p>
      </div>
      <button
        type="button"
        onClick={enable}
        disabled={busy}
        className="flex h-9 shrink-0 items-center gap-1.5 rounded-pill bg-accent px-3.5 text-xs font-bold text-accent-ink transition-transform active:scale-95 disabled:opacity-60"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <BellRing size={13} />} Turn on
      </button>
      <button
        type="button"
        onClick={snooze}
        aria-label="Not now"
        className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:text-foreground"
      >
        <X size={16} />
      </button>
    </div>
  );
}
