import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { formatCount } from "@hypefy/core/format";
import { supabase } from "@/supabase";
import { unreadCount } from "@/notifications/load";
import { HypeIcon } from "@/glyphs";
import { palette, type, family } from "@/theme";

/**
 * The bell, with the count on it.
 *
 * **It is the Hype mark, not a bell**, because that is what the website
 * draws — NotificationBell renders HypeIcon. The name is the website's and is
 * kept so the two files are findable from each other.
 *
 * **Counted once, then kept current by realtime, which is what the website
 * does too.** The first version re-read the count whenever the bar regained
 * focus, and that was wrong twice over: `useFocusEffect` depends on a
 * navigation context, and this component is rendered as the navigator's
 * HEADER rather than as a screen, where that context is not something to
 * rely on — and an effect body that calls the counter directly is the
 * cascading-render shape react-hooks forbids, which is how the mistake
 * surfaced. An INSERT bumps the badge; an UPDATE re-reads it, which is how
 * it clears after Activity marks rows read.
 */
export function NotificationBell() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    /*
     * Declared out here, and torn down by the cleanup even though it is
     * assigned asynchronously. The website records the leak this prevents:
     * leaving before getUser() resolved ran the cleanup while the channel
     * was still null, and the subscribe happened afterwards with nothing
     * left to tear it down — open and leave a few times and the socket
     * carries that many dead subscriptions.
     */
    let channel: ReturnType<typeof supabase.channel> | null = null;

    /*
     * Reading and applying are separate, which is the rule #79 established:
     * an event handler may set state, an effect body may not. The await is
     * what makes this legal — nothing is set during the effect's own run.
     */
    const readCount = async (): Promise<number | null> => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) return null;
        return await unreadCount(supabase as never, data.user.id);
      } catch {
        // A badge that cannot be counted shows nothing. "Zero" and "we could
        // not tell" look identical here, and neither is worth an error on
        // the one control that is on every screen.
        return null;
      }
    };

    const apply = (next: number | null) => {
      if (cancelled || next === null) return;
      setUnread(next);
    };

    void (async () => {
      const first = await readCount();
      apply(first);

      const { data } = await supabase.auth.getUser();
      if (cancelled || !data.user) return;

      channel = supabase
        .channel(`notif-badge:${data.user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${data.user.id}`,
          },
          // A new one: add it. Counting again would be a round trip to
          // learn what the payload already said.
          () => setUnread((n) => n + 1),
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${data.user.id}`,
          },
          // Rows were marked read, possibly many at once, so the count has
          // to come from the database rather than from arithmetic here.
          () => void readCount().then(apply),
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? `Activity, ${unread} unread` : "Activity"}
      hitSlop={8}
      style={styles.action}
      onPress={() => router.push("/notifications")}
    >
      <HypeIcon size={22} color={palette.foreground} strokeWidth={2.2} />
      {unread > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unread > 9 ? "9+" : formatCount(unread)}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  badge: {
    position: "absolute",
    right: 5,
    top: 5,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: palette.accent,
    alignItems: "center",
    justifyContent: "center",
    // The website rings the badge in the background colour so it reads as
    // sitting on top of the mark rather than merging with it.
    borderWidth: 2,
    borderColor: palette.background,
  },
  badgeText: {
    color: palette.accentInk,
    fontFamily: family.bold,
    fontSize: type.tiny,
    lineHeight: type.tiny + 2,
  },
});
