import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { router, useRootNavigationState } from "expo-router";
import { parseWebHref } from "@hypefy/core/notif-target";
import { PUSH_CHANNEL_ID, PUSH_CHANNEL_NAME } from "@hypefy/core/push-channel";
import { mobileRoute } from "./route";

/**
 * Tapping a push, and the Android channel it arrives on.
 *
 * **Two ways in, and only one of them is obvious.** A tap while the app is
 * running comes through the listener. A tap that LAUNCHED the app has already
 * happened before any listener exists, and is only readable from
 * `getLastNotificationResponseAsync` — which is the common case, because a
 * notification is usually tapped from a phone that was asleep. Handling only
 * the listener gives an app that works perfectly in testing, while in real
 * use every notification opens the feed.
 *
 * **The destination is read from `data.url`**, a website path, because that
 * is what the server has sent since before there was a second client.
 * `parseWebHref` turns it back into a place and is held to the producer by a
 * round-trip test over every kind, so a path this does not understand is a
 * failing test rather than a tap that lands on the feed.
 */
export function usePushTaps() {
  const navState = useRootNavigationState();
  // The launching tap is handled once. Without this, remounting the root —
  // which a fast refresh and a resumed process both do — reopens whatever
  // was last tapped, possibly days later.
  const launchHandled = useRef(false);

  // The channel the sender names. Created as early as possible: a
  // notification arriving before the channel exists goes to Firebase's own
  // fallback and stays there for that install.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    void Notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
      name: PUSH_CHANNEL_NAME,
      importance: Notifications.AndroidImportance.HIGH,
    }).catch(() => {
      // A failed channel means Firebase's fallback, which still delivers.
      // Not worth failing a launch over.
    });
  }, []);

  useEffect(() => {
    // Pushing before the navigator has mounted is dropped silently, and the
    // cold-start tap is exactly that moment.
    if (!navState?.key) return;

    const open = (response: Notifications.NotificationResponse | null) => {
      const data = response?.notification.request.content.data;
      const url = data && typeof data === "object" ? (data as { url?: unknown }).url : null;
      if (typeof url !== "string" || url.length === 0) return;
      const route = mobileRoute(parseWebHref(url));
      // A place this app does not have: Activity lists it, and that is a
      // better answer than opening nothing after somebody tapped.
      router.push((route ?? { pathname: "/notifications" }) as never);
    };

    if (!launchHandled.current) {
      launchHandled.current = true;
      void Notifications.getLastNotificationResponseAsync()
        .then(open)
        .catch(() => {});
    }

    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [navState?.key]);
}
