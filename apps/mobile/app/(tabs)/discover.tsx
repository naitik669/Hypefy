import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { navSpace } from "@hypefy/tokens";
import { formatCount } from "@hypefy/core/format";
import { supabase } from "@/supabase";
import { loadDiscover, type DiscoverData, type DiscoverProfile } from "@/discover/load";
import { Search } from "lucide-react-native";
import { Avatar } from "@/avatar";
import { VerifiedStar } from "@/glyphs";
import { base, palette, type, family, radius } from "@/theme";

/**
 * Discover — ranked by the website's own ranking.
 *
 * `discoverScore` from @hypefy/core/discover-rank does the whole thing,
 * caps included. The caps matter: author affinity stops at 30 and tag
 * affinity at 15, so they enrich the order rather than dominate it. A
 * client that forgot one would quietly turn Discover into "more of
 * whoever you clicked last", and nobody could point at it.
 *
 * Reached by the compass in the top bar, which is where the web puts it
 * too — it has never had a tab. `bottomBar: false` in @hypefy/core's
 * navigation says so, and the tabs layout registers it with `href: null`.
 *
 * **Search opens from the field at the top**, which is where the website
 * puts it: DiscoverView's first row is a read-only SearchBar linking to
 * /search. It used to be an icon in the top bar here, borrowing the seat
 * the notification bell was always going to take — so the bell taking it
 * back is what moved search to where the website already had it, rather
 * than leaving the app with one way in fewer.
 *
 * A three-across grid rather than the web's masonry: the web measures
 * each image's aspect ratio and packs columns to it, which needs a
 * measuring pass this screen does not have. Squares are honest and even.
 */
export default function Discover() {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<DiscoverData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = useCallback(async (): Promise<
    { kind: "ok"; data: DiscoverData } | { kind: "failed"; message: string } | { kind: "signed-out" }
  > => {
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) return { kind: "signed-out" };
      return { kind: "ok", data: await loadDiscover(supabase as never, auth.user.id) };
    } catch (e) {
      return {
        kind: "failed",
        message: e instanceof Error ? e.message : "Could not load Discover.",
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
    setData(result.data);
  }, []);

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

  const reload = useCallback(async () => {
    apply(await fetchAll());
  }, [fetchAll, apply]);

  if (error) {
    return (
      <View style={[base.screen, base.centre]}>
        <Text style={base.title}>Could not load Discover</Text>
        {/* Verbatim. This screen runs eight queries, and the message names
            which one failed — see @/query. */}
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

  if (!data) {
    return (
      <View style={[base.screen, base.centre]}>
        <ActivityIndicator color={palette.accent} />
      </View>
    );
  }

  return (
    <View style={base.screen}>
      <FlatList
        data={data.posts}
        keyExtractor={(p) => p.id}
        numColumns={3}
        renderItem={({ item }) => {
          const media = item.image_urls?.[0] ?? item.image_url ?? null;
          const author =
            item.profiles?.display_name || item.profiles?.username || "Someone";
          return (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`Comments on ${author}'s post`}
              onPress={() =>
                router.push({
                  pathname: "/post/[id]/comments",
                  params: { id: item.id, owner: item.user_id },
                })
              }
              style={styles.cell}
            >
              {media ? (
                <Image
                  source={{ uri: media }}
                  style={styles.cellImage}
                  resizeMode="cover"
                  accessibilityLabel={`Post by ${author}`}
                />
              ) : (
                <Text style={styles.cellText} numberOfLines={5}>
                  {item.caption}
                </Text>
              )}
            </Pressable>
          );
        }}
        ListHeaderComponent={
          <View>
            {/*
              * A field that is not a field: it links rather than types, as
              * the website's does with its `href`. Typing happens on the
              * search screen, which owns the query, the debounce and the
              * results — two places to type into one query is how a tap on
              * a topic runs a search the box does not show.
              */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Search people, posts and tags"
              onPress={() => router.push("/search")}
              style={({ pressed }) => [styles.searchPill, pressed && styles.searchPressed]}
            >
              <Search size={18} color={palette.muted} />
              <Text style={styles.searchHint}>Search people, posts, #tags</Text>
            </Pressable>

            {data.tags.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.heading}>Trending</Text>
                {/*
                  * The RPC reports velocity, not a raw total — rising, not
                  * popular — which is why a tag with four posts today can
                  * outrank one with forty from last month.
                  *
                  * The chips do not navigate: /tag/[tag] is not ported, and
                  * a chip that looks tappable and is not is worse than one
                  * that plainly is not.
                  */}
                <View style={styles.chips}>
                  {data.tags.map((t) => (
                    <View key={t.tag} style={styles.chip}>
                      <Text style={styles.chipTag}>#{t.tag}</Text>
                      {t.count > 0 && (
                        <Text style={styles.chipCount}>{formatCount(t.count)}</Text>
                      )}
                    </View>
                  ))}
                </View>
              </View>
            )}

            {data.people.length > 0 && (
              <PeopleRow title="People you might know" people={data.people} />
            )}
            {data.newPeople.length > 0 && (
              <PeopleRow title="New this week" people={data.newPeople} />
            )}

            <Text style={styles.heading}>For you</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={base.body}>Nothing to discover yet.</Text>
          </View>
        }
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
        contentContainerStyle={{ paddingBottom: navSpace(insets.bottom) }}
        initialNumToRender={12}
        removeClippedSubviews
      />
    </View>
  );
}

function PeopleRow({ title, people }: { title: string; people: DiscoverProfile[] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{title}</Text>
      <FlatList
        data={people}
        keyExtractor={(p) => p.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.peopleRow}
        renderItem={({ item }) => {
          const name = item.display_name || item.username || "Someone";
          return (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`${name}'s profile`}
              disabled={!item.username}
              onPress={() =>
                item.username &&
                router.push({ pathname: "/u/[username]", params: { username: item.username } })
              }
              style={styles.person}
            >
              <Avatar name={name} hue={item.avatar_hue ?? 200} size={56} />
              <View style={styles.personName}>
                <Text style={styles.personText} numberOfLines={1}>
                  {name}
                </Text>
                {item.is_verified && <VerifiedStar size={11} />}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // The website's own pill: h-11, rounded-2xl, a border and the surface.
  searchPill: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  searchPressed: { opacity: 0.7 },
  searchHint: { color: palette.faint, fontFamily: family.normal, fontSize: type.sm },

  section: { paddingTop: 14 },
  heading: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    color: palette.foreground,
    fontFamily: family.bold,
    fontSize: type.base,
  },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipTag: { color: palette.foreground, fontFamily: family.semibold, fontSize: type.xs },
  chipCount: { color: palette.muted, fontFamily: family.medium, fontSize: type.tiny },

  peopleRow: { paddingHorizontal: 16, gap: 14 },
  person: { width: 72, alignItems: "center", gap: 6 },
  personName: { flexDirection: "row", alignItems: "center", gap: 3 },
  personText: {
    color: palette.foreground,
    fontFamily: family.medium,
    fontSize: type.tiny,
    flexShrink: 1,
  },

  cell: { flex: 1 / 3, aspectRatio: 1, padding: 1 },
  cellImage: { width: "100%", height: "100%", backgroundColor: palette.elevated },
  cellText: {
    flex: 1,
    padding: 8,
    backgroundColor: palette.surface,
    color: palette.muted,
    fontFamily: family.normal,
    fontSize: type.tiny,
  },

  empty: { paddingTop: 40, alignItems: "center" },
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
