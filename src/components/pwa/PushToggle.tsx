"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SettingToggle } from "@/components/settings/SettingToggle";
import {
  pushSupported,
  getPushSubscription,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push";

/**
 * Device-level push toggle. Subscribes this browser to web push and stores the
 * subscription server-side; per-type filtering happens via notif_prefs.
 */
export function PushToggle({ userId }: { userId: string }) {
  const supabase = createClient();
  const [supported, setSupported] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pushSupported()) {
      setSupported(false);
      return;
    }
    getPushSubscription().then((sub) => setEnabled(!!sub));
  }, []);

  async function toggle(next: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (next) {
        const result = await subscribeToPush(supabase, userId);
        if (result === "subscribed") setEnabled(true);
        else if (result === "unconfigured") setError("Push isn't configured on this deployment yet.");
        else if (result === "denied") setError("Notifications are blocked, allow them in your browser settings.");
        else setError("Something went wrong enabling push.");
      } else {
        await unsubscribeFromPush(supabase);
        setEnabled(false);
      }
    } catch {
      setError("Something went wrong enabling push.");
    } finally {
      setBusy(false);
    }
  }

  if (!supported) {
    return (
      <p className="px-2 text-xs text-faint">
        Push isn&apos;t supported in this browser. On iPhone, add Hypefy to your home screen first.
      </p>
    );
  }

  return (
    <div>
      <SettingToggle
        label="Push notifications"
        sub="Get pinged on this device even when Hypefy is closed"
        checked={enabled}
        onChange={toggle}
        disabled={busy}
      />
      {error && <p className="px-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
