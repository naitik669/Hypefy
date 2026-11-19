import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ArrowLeft, Search as SearchIcon } from "lucide-react-native";
import { latestOnly } from "@hypefy/core/search-run";
import { formatCount } from "@hypefy/core/format";
import { supabase } from "@/supabase";
import { search, NO_RESULTS, type SearchResults } from "@/search/load";
import { buildSections, type SearchRow } from "@/search/rows";
import { Avatar } from "@/avatar";
import { VerifiedStar } from "@/glyphs";
import { base, palette, type, family, radius } from "@/theme";

/**
 * Search.
 *
 * Two things this screen has to get right, and both are shared rather
 * than rewritten:
 *
 *  - **Only the newest answer may speak.** `latestOnly` from
 *    @hypefy/core/search-run. Answers do not come back in the order the
 *    questions went out — "ab" can arrive after "abc" — and without it the
 *    late answer to the older question replaces the results for what is
 *    actually in the box.
 *  - **A failed search is not an empty one.** "Nothing matched" sends
 *    someone away believing their friend is not on Hypefy; "search is not
 *    working" sends them back in a minute.
 *
 * Typing is debounced rather than asking per keystroke: on a phone that
 * is a request per character over a mobile connection, and the answers
 * then race each other for no benefit.
 */

/** Long enough to stop asking per keystroke, short enough to feel live. */
const DEBOUNCE_MS = 250;

export default function Search() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(NO_RESULTS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * A ref, and the one place in this app where that is right: `latestOnly`
   * hands out ids that must survive re-renders, and nothing renders from
   * them. Created once, never read during render.
   */
  const runs = useRef(latestOnly()).current;

  const ask = useCallback(
    async (q: string) => {
      const run = runs.begin();
      if (!q.trim()) {
        setResults(NO_RESULTS);
        setBusy(false);
        setError(null);
        return;
      }
      setBusy(true);
      try {
        const found = await search(supabase as never, q);
        // Something newer has been asked since. This answer is for a
        // question nobody is looking at any more.
        if (!runs.isCurrent(run)) return;
        setError(null);
        setResults(found);
      } catch (e) {
        if (!runs.isCurrent(run)) return;
        setError(e instanceof Error ? e.message : "Search did not work.");
      } finally {
        if (runs.isCurrent(run)) setBusy(false);
      }
    },
    [runs],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void ask(query);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, ask]);

  const sections = buildSections(results);

  return (
    <View style={base.screen}>
      <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={10}
          onPress={() => router.back()}
          style={styles.back}
        >
          <ArrowLeft size={22} color={palette.foreground} />
        </Pressable>
        <View style={styles.field}>
          <SearchIcon size={16} color={palette.faint} />
          <TextInput
            accessibilityLabel="Search"
            placeholder="Search people, posts, #tags"
            placeholderTextColor={palette.faint}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            returnKeyType="search"
            style={styles.input}
          />
          {busy && <ActivityIndicator color={palette.faint} size="small" />}
        </View>
      </View>

      {error ? (
        <View style={base.centre}>
          <Text style={base.title}>Search did not work</Text>
          <Text style={[base.body, styles.gap]}>{error}</Text>
        </View>
      ) : results.failed ? (
        <View style={base.centre}>
          {/*
            * Not "no results". Every part that was asked for errored, and
            * telling someone their friend is not here when the search
            * simply broke is the worse of the two wrong answers.
            */}
          <Text style={base.title}>Search is not working</Text>
          <Text style={[base.body, styles.gap]}>Try again in a moment.</Text>
        </View>
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(row) => row.key}
          renderItem={({ item }) => <Row row={item} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            query.trim() && !busy ? (
              <View style={styles.empty}>
                <Text style={base.title}>Nothing matched</Text>
                <Text style={[base.body, styles.gap]}>
                  {results.scope.kind === "user"
                    ? "No account with that name."
                    : results.scope.kind === "tag"
                      ? "Nothing posted with that tag yet."
                      : "Try a different word."}
                </Text>
              </View>
            ) : undefined
          }
        />
      )}
    </View>
  );
}

function Row({ row }: { row: SearchRow }) {
  if (row.kind === "heading") {
    return <Text style={styles.heading}>{row.label}</Text>;
  }

  if (row.kind === "person") {
    const p = row.person;
    const name = p.display_name || p.username || "Someone";
    return (
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${name}'s profile`}
        disabled={!p.username}
        onPress={() =>
          p.username && router.push({ pathname: "/u/[username]", params: { username: p.username } })
        }
        style={({ pressed }) => [styles.person, pressed && styles.pressed]}
      >
        <Avatar name={name} hue={p.avatar_hue ?? 200} size={40} />
        <View style={styles.personText}>
          <View style={styles.personName}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            {p.is_verified && <VerifiedStar size={13} />}
          </View>
          {p.username && <Text style={styles.handle}>@{p.username}</Text>}
        </View>
      </Pressable>
    );
  }

  const post = row.post;
  const media = post.image_urls?.[0] ?? post.image_url ?? null;
  const author = post.profiles?.display_name || post.profiles?.username || "Someone";
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Comments on ${author}'s post`}
      onPress={() =>
        router.push({
          pathname: "/post/[id]/comments",
          params: { id: post.id, owner: post.user_id },
        })
      }
      style={({ pressed }) => [styles.post, pressed && styles.pressed]}
    >
      {media ? (
        <Image
          source={{ uri: media }}
          style={styles.thumb}
          resizeMode="cover"
          accessibilityLabel={`Post by ${author}`}
        />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty]} />
      )}
      <View style={styles.personText}>
        <Text style={styles.name} numberOfLines={1}>
          {author}
        </Text>
        {post.caption ? (
          <Text style={styles.caption} numberOfLines={2}>
            {post.caption}
          </Text>
        ) : null}
        <Text style={styles.counts}>
          {formatCount(post.hype_count ?? 0)} hypes · {formatCount(post.comment_count ?? 0)}{" "}
          comments
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  field: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 14,
    marginRight: 8,
  },
  input: {
    flex: 1,
    color: palette.foreground,
    fontFamily: family.medium,
    fontSize: type.sm,
    padding: 0,
  },

  heading: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
    color: palette.muted,
    fontFamily: family.bold,
    fontSize: type.xs,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },

  person: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  personText: { flex: 1 },
  personName: { flexDirection: "row", alignItems: "center", gap: 4 },
  name: {
    color: palette.foreground,
    fontFamily: family.semibold,
    fontSize: type.sm,
    flexShrink: 1,
  },
  handle: { color: palette.muted, fontFamily: family.normal, fontSize: type.xs },

  post: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  thumb: { width: 48, height: 48, borderRadius: 10, backgroundColor: palette.elevated },
  thumbEmpty: { borderWidth: 1, borderColor: palette.border },
  caption: {
    marginTop: 2,
    color: palette.foreground,
    fontFamily: family.normal,
    fontSize: type.xs,
  },
  counts: {
    marginTop: 2,
    color: palette.muted,
    fontFamily: family.normal,
    fontSize: type.tiny,
  },

  pressed: { opacity: 0.7 },
  empty: { paddingTop: 60, paddingHorizontal: 24, alignItems: "center" },
  gap: { marginTop: 10 },
});
