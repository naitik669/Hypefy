"use client";

import { PushNotifications } from "@capacitor/push-notifications";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isNative, platform } from "@/lib/native";

/**
 * Native push registration (FCM on Android, APNs on iOS).
 *
 * Deliberately separate from lib/push.ts. That one speaks Web Push: a VAPID
 * endpoint plus encryption keys, delivered by the browser's push service and
 * only usable while a service worker is alive. Inside the native shell there
 * is no service worker push at all — the OS delivers, and all we hold is an
 * opaque registration token. Same feature to a user, different plumbing.
 */

export type NativePushResult =
  | "registered"
  | "denied"
  | "unsupported"
  | "failed";

/**
 * Ask for permission, register with the OS, and store the token.
 *
 * Resolves only once the token actually arrives: registration is
 * event-driven, so awaiting `register()` alone would report success before
 * knowing whether a token was ever issued.
 */
export async function enableNativePush(
  supabase: SupabaseClient,
  userId: string,
): Promise<NativePushResult> {
  if (!isNative()) return "unsupported";

  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== "granted") return "denied";

    const token = await new Promise<string | null>((resolve) => {
      // Registration can fail silently on a device with no Play Services or a
      // broken FCM config; without a timeout this promise would never settle
      // and the settings toggle would spin forever.
      const timer = setTimeout(() => resolve(null), 10_000);

      void PushNotifications.addListener("registration", (t) => {
        clearTimeout(timer);
        resolve(t.value);
      });
      void PushNotifications.addListener("registrationError", () => {
        clearTimeout(timer);
        resolve(null);
      });
      void PushNotifications.register();
    });

    if (!token) return "failed";

    const p = platform();
    const { error } = await supabase.from("push_devices").upsert(
      {
        token,
        user_id: userId,
        platform: p === "ios" ? "ios" : "android",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "token" },
    );
    if (error) return "failed";

    return "registered";
  } catch {
    return "failed";
  }
}

/** Drop this device's token. Best-effort: the OS token is not revoked, we just
 *  stop sending to it, which is what the user asked for. */
export async function disableNativePush(supabase: SupabaseClient, userId: string) {
  if (!isNative()) return;
  try {
    await PushNotifications.unregister();
  } catch { /* already unregistered */ }
  // Deleting by user rather than token: unregister() may have already
  // invalidated the token we knew about, and a stale row would keep
  // receiving.
  await supabase.from("push_devices").delete().eq("user_id", userId);
}

/** Has this device already registered for push? */
export async function nativePushEnabled(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const perm = await PushNotifications.checkPermissions();
    if (perm.receive !== "granted") return false;
    const { data } = await supabase
      .from("push_devices")
      .select("token")
      .eq("user_id", userId)
      .limit(1);
    return !!data?.length;
  } catch {
    return false;
  }
}
