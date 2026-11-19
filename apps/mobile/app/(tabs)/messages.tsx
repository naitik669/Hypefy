import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { navSpace } from "@hypefy/tokens";
import { formatCount } from "@hypefy/core/format";
import { timeAgoShort } from "@hypefy/core/time";
import { supabase } from "@/supabase";
import { loadInbox, inboxTitle, previewOf, type InboxRow } from "@/messages/load";
import { Avatar } from "@/avatar";
import { VerifiedStar } from "@/glyphs";
import { base, palette, type, family, radius } from "@/theme";

/**
 * The inbox.
 *
 * Reloaded on focus as well as on mount: coming back from a thread you
 * have just read should not still show it unread, and a tab navigator
 * keeps the scene mounted so a plain effect never fires again.
 *
 * **A locked chat is invisible here, not missing.** The web keeps
 * locked and hidden chats at their own levels, reached by a gesture this
 * app has no equivalent for; this list is the normal level, which is
 * what the web shows by default. Said on the screen rather than left as
 * a chat that seems to have vanished.
 */
export default function Messages() {
  const insets = useSafeAreaInsets();
  const [threads, setThreads] = useState<InboxRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = useCallback(async (): Promise<
    { kind: "ok"; threads: InboxRow[] } | { kind: "failed"; message: string } | { kind: "signed-out" }
  > => {
    try {
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError || !data.user) return { kind: "signed-out" };
      return { kind: "ok", threads: await loadInbox(supabase as never, data.user.id) };
    } catch (e) {
      return {
        kind: "failed",
        message: e instanceof Error ? e.message : "Could not load your messages.",
      };
    }
  }, []);

  const apply = useCallback((result: Awaited<ReturnType<typeof fetchAll>>) => {
    if (result.kind === "signed-out") {
      router.replace("/");
      return;
    }
    if (result.kind === "failed") {
      setError(result.message);
      return;
    }
    setError(null);
    setThreads(result.threads);
  }, []);

  const reload = useCallback(async () => {
    apply(await fetchAll());
  }, [fetchAll, apply]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await fetchAll();
      if (!cancelled) apply(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchAll, apply]);

  useFocusEffect(
    useCallback(() => {
      // Returning from a thread: the unread count there is now wrong.
      void reload();
    }, [reload]),
  );

  if (error) {
    return (
      <View style={[base.screen, base.centre]}>
        <Text style={base.title}>Could not load your messages</Text>
        <Text style={[base.body, styles.gap]}>{error}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Try again"
          style={styles.retry}
          onPress={() => void reload()}
        >
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (!threads) {
    return (
      <View style={[base.screen, base.centre]}>
        <ActivityIndicator color={palette.accent} />
      </View>
    );
  }

  return (
    <View style={base.screen}>
      <FlatList
        data={threads}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => <Row row={item} />}
        contentContainerStyle={{ paddingBottom: navSpace(insets.bottom) }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void reload().finally(() => setRefreshing(false));
            }}
            tintColor={palette.accent}
            colors={[palette.accent]}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={base.title}>No messages yet</Text>
            <Text style={[base.body, styles.gap]}>
              Start a chat from someone&apos;s profile on the web and it turns up here.
            </Text>
          </View>
        }
        ListFooterComponent={
          threads.length > 0 ? (
            <Text style={styles.note}>
              Locked chats are not shown here yet. They are still on the web.
            </Text>
          ) : undefined
        }
      />
    </View>
  );
}

function Row({ row }: { row: InboxRow }) {
  const title = inboxTitle(row);
  const other = row.other;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        row.unread > 0 ? `${title}, ${row.unread} unread` : title
      }
      onPress={() =>
        router.push({ pathname: "/messages/[id]", params: { id: row.id } })
      }
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Avatar name={title} hue={other?.avatar_hue ?? 200} size={48} />
      <View style={styles.text}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {other?.is_verified && <VerifiedStar size={13} />}
          {row.lastAt && <Text style={styles.when}>· {timeAgoShort(row.lastAt)}</Text>}
        </View>
        <Text style={[styles.preview, row.unread > 0 && styles.previewUnread]} numberOfLines={1}>
          {previewOf(row)}
        </Text>
      </View>
      {row.unread > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{formatCount(row.unread)}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  pressed: { opacity: 0.7 },
  text: { flex: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  title: {
    color: palette.foreground,
    fontFamily: family.semibold,
    fontSize: type.sm,
    flexShrink: 1,
  },
  when: { color: palette.muted, fontFamily: family.normal, fontSize: type.xs },
  preview: {
    marginTop: 2,
    color: palette.muted,
    fontFamily: family.normal,
    fontSize: type.xs,
  },
  // Unread reads as bolder and brighter, which is the one difference a
  // glance has to catch.
  previewUnread: { color: palette.foreground, fontFamily: family.semibold },

  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: palette.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: palette.accentInk, fontFamily: family.bold, fontSize: type.tiny },

  empty: { paddingTop: 60, paddingHorizontal: 24, alignItems: "center" },
  note: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    color: palette.faint,
    fontFamily: family.normal,
    fontSize: type.tiny,
    textAlign: "center",
  },
  gap: { marginTop: 10 },
  retry: {
    marginTop: 24,
    backgroundColor: palette.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 22,
    minHeight: 44,
    minWidth: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  retryText: { color: palette.accentInk, fontFamily: family.bold, fontSize: type.sm },
});
