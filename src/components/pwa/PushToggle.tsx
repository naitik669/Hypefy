"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SettingToggle } from "@/components/settings/SettingToggle";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

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
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setSupported(false);
      return;
    }
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setEnabled(!!sub);
    });
  }, []);

  async function toggle(next: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;

      if (next) {
        const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!key) { setError("Push isn't configured on this deployment yet."); return; }

        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setError("Notifications are blocked — allow them in your browser settings.");
          return;
        }

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        });
        const json = sub.toJSON();
        const { error: dbErr } = await supabase.from("push_subscriptions").upsert({
          endpoint: sub.endpoint,
          user_id: userId,
          p256dh: json.keys?.p256dh ?? "",
          auth: json.keys?.auth ?? "",
        });
        if (dbErr) { await sub.unsubscribe(); setError("Couldn't save subscription."); return; }
        setEnabled(true);
      } else {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          await sub.unsubscribe();
        }
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
