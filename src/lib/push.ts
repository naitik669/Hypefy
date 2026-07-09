import type { SupabaseClient } from "@supabase/supabase-js";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window;
}

export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export type SubscribeResult = "subscribed" | "denied" | "unconfigured" | "error";

/**
 * Ask for notification permission, subscribe this browser to web push, and
 * persist the subscription. Shared by the settings toggle and the
 * notifications-page nudge.
 */
export async function subscribeToPush(
  supabase: SupabaseClient,
  userId: string,
): Promise<SubscribeResult> {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) return "unconfigured";

  try {
    const reg = await navigator.serviceWorker.ready;
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return "denied";

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
    const json = sub.toJSON();
    const { error } = await supabase.from("push_subscriptions").upsert({
      endpoint: sub.endpoint,
      user_id: userId,
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
    });
    if (error) {
      await sub.unsubscribe();
      return "error";
    }
    return "subscribed";
  } catch {
    return "error";
  }
}

/** Drop this browser's push subscription (server row + browser registration). */
export async function unsubscribeFromPush(supabase: SupabaseClient): Promise<void> {
  const sub = await getPushSubscription();
  if (!sub) return;
  await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
}
