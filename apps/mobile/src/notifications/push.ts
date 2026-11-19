import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { platformName } from "./platform";

/**
 * Push registration.
 *
 * **The token is the NATIVE FCM one, not an Expo push token, and that is the
 * whole design decision here.** The server already sends push: src/lib/fcm.ts
 * signs a service-account JWT and posts to
 * `projects/<id>/messages:send` with a device token, and #66 proved that path
 * end to end against the `hypefy-4f6bb` registration. `getExpoPushTokenAsync`
 * would hand back a token only Expo's own service can deliver to — a second
 * delivery path, a second thing to configure, and a server change — for a
 * feature that already works. `getDevicePushTokenAsync` returns the FCM
 * registration the server is already built to use, so this is the
 * registration half of a system that is otherwise finished.
 *
 * It also means the payload needs no translation: sendFcm already puts the
 * destination in `data.url` as a website path, which is what the tap handler
 * in app/_layout.tsx resolves.
 *
 * The row goes in `push_devices`, keyed on the token, exactly as the
 * Capacitor shell's lib/native-push.ts wrote it — same table, same platform
 * values, so a device that was registered by the old shell and is now running
 * this app updates its row rather than leaving a stale one receiving.
 */

export type PushResult = "registered" | "denied" | "unsupported" | "failed";

type Answer = { error: unknown };
type Upsertable = {
  from(table: string): {
    upsert(
      values: Record<string, unknown>,
      options: { onConflict: string },
    ): PromiseLike<Answer>;
    delete(): { eq(column: string, value: string): PromiseLike<Answer> };
  };
};

/**
 * Ask, register, store.
 *
 * `getDevicePushTokenAsync` can reject on a device with no Play Services or a
 * broken FCM config, which is the one failure that must not be reported as a
 * refusal: "you said no" and "this device cannot" need different words on the
 * screen, because only one of them can be fixed by the person reading it.
 */
export async function enablePush(
  supabase: Upsertable,
  userId: string,
): Promise<PushResult> {
  const platform = platformName(Platform.OS);
  if (!platform) return "unsupported";

  try {
    let status = (await Notifications.getPermissionsAsync()).status;
    if (status !== "granted") {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== "granted") return "denied";

    const token = (await Notifications.getDevicePushTokenAsync()).data;
    if (typeof token !== "string" || token.length === 0) return "failed";

    const { error } = await supabase.from("push_devices").upsert(
      {
        token,
        user_id: userId,
        platform,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "token" },
    );
    return error ? "failed" : "registered";
  } catch {
    return "failed";
  }
}

/**
 * Stop sending to this device.
 *
 * By user rather than by token: the token we knew may already have been
 * rotated or invalidated by the OS, and a row left behind keeps receiving —
 * which is the one outcome somebody who turned this off would notice.
 */
export async function disablePush(supabase: Upsertable, userId: string): Promise<void> {
  await supabase.from("push_devices").delete().eq("user_id", userId);
}

/**
 * Has this device been asked yet?
 *
 * Three answers, not two. "Not asked" is where the screen offers to turn push
 * on; "denied" is where it has to name the system setting instead, because
 * the OS will not show a second prompt and a button that silently does
 * nothing is worse than an instruction.
 */
export async function pushPermission(): Promise<"granted" | "denied" | "ask"> {
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (perm.status === "granted") return "granted";
    // canAskAgain distinguishes a refusal from a prompt never shown. Without
    // it the two look identical and the screen offers a button the OS will
    // ignore.
    return perm.canAskAgain ? "ask" : "denied";
  } catch {
    return "ask";
  }
}
