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
import { router } from "expo-router";
import { navSpace } from "@hypefy/tokens";
import { supabase } from "@/supabase";
import { loadFeed, type FeedPost } from "@/feed/load";
import { FeedCard, isRenderable } from "@/feed/FeedCard";
import { base, palette, type, family, radius } from "@/theme";

/**
 * Home — the first screen in the app that shows real data.
 *
 * A `FlatList`, not a mapped ScrollView: the candidate window is up to 190
 * posts and each card holds a full-width image. The rules file is explicit
 * about this and it is the one performance decision on the screen that
 * cannot be retrofitted cheaply.
 *
 * `navSpace(bottom inset)` below the last row, the same figure the web's
 * scroll containers leave and the same one Placeholder uses — so content
 * clears the tab bar by arithmetic both clients share rather than by a
 * number typed twice.
 *
 * Three states, all of them said out loud: loading, failed with the reason,
 * and empty. The empty one matters more here than it looks — this account
 * has 30 posts in the whole database, so "nothing yet" is a state real
 * users will hit on day one, and a blank screen reads as a broken feed.
 */
export default function Home() {
  const insets = useSafeAreaInsets();
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  /**
   * Fetches, and sets no state at all.
   *
   * That separation is not tidiness: react-hooks/set-state-in-effect
   * rejected the first version, and it was right for a reason worth
   * recording. The effect called a `load` whose first line was
   * `setError(null)` — synchronous, during the effect body, which is the
   * cascading render the rule exists to stop. Moving the clear into the
   * callers is what fixes it, not silencing the rule: an event handler may
   * clear state, an effect may not.
   */
  const fetchFeed = useCallback(async (): Promise<
    { kind: "posts"; posts: FeedPost[] } | { kind: "failed"; message: string } | { kind: "signed-out" }
  > => {
    try {
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError || !data.user) return { kind: "signed-out" };
      return { kind: "posts", posts: await loadFeed(supabase as never, data.user.id) };
    } catch (e) {
      return {
        kind: "failed",
        message: e instanceof Error ? e.message : "Could not load your feed.",
      };
    }
  }, []);

  /** Applies a result. Called from an event or after an await, never in an effect body. */
  const apply = useCallback(
    (result: Awaited<ReturnType<typeof fetchFeed>>) => {
      if (result.kind === "signed-out") {
        // The session has gone. The entry router owns that decision, so
        // this hands it back rather than rendering an empty feed as though
        // the account simply had nothing in it.
        router.replace("/");
        return;
      }
      if (result.kind === "failed") {
        setError(result.message);
        return;
      }
      setError(null);
      setPosts(result.posts);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await fetchFeed();
      if (!cancelled) apply(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchFeed, apply]);

  const reload = useCallback(async () => {
    apply(await fetchFeed());
  }, [fetchFeed, apply]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  }, [reload]);

  if (error) {
    return (
      <View style={[base.screen, base.centre]}>
        <Text style={base.title}>Could not load your feed</Text>
        {/* The message verbatim: on a first real-data screen this is the
            one thing worth knowing, and a paraphrase hides it. */}
        <Text style={[base.body, styles.gap]}>{error}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Try again"
          style={styles.button}
          onPress={() => void reload()}
        >
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (posts === null) {
    return (
      <View style={[base.screen, base.centre]}>
        <ActivityIndicator color={palette.accent} />
      </View>
    );
  }

  const rows = posts.filter(isRenderable);

  return (
    <View style={base.screen}>
      <FlatList
        data={rows}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <FeedCard post={item} />}
        contentContainerStyle={{ paddingBottom: navSpace(insets.bottom) }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={palette.accent}
            colors={[palette.accent]}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={base.title}>Nothing here yet</Text>
            <Text style={[base.body, styles.gap]}>
              Follow a few people and their posts turn up here. Pull down to check again.
            </Text>
          </View>
        }
        // A fixed window: each card is a full-width square plus its chrome,
        // so rendering more than a couple ahead buys nothing.
        initialNumToRender={3}
        windowSize={5}
        removeClippedSubviews
      />
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { marginTop: 10 },
  empty: { paddingTop: 80, paddingHorizontal: 24, alignItems: "center" },
  button: {
    marginTop: 24,
    backgroundColor: palette.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 22,
    minHeight: 44,
    minWidth: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: palette.accentInk, fontFamily: family.bold, fontSize: type.sm },
});
