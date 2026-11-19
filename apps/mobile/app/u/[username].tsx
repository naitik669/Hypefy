import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Lock } from "lucide-react-native";
import { formatCount } from "@hypefy/core/format";
import { pronounLabel } from "@hypefy/core/profile";
import {
  followAction,
  followLabel,
  optimisticFollow,
  settleFollow,
  type FollowState,
} from "@hypefy/core/follow";
import { bannerColors } from "@hypefy/core/banner-colors";
import { supabase } from "@/supabase";
import { loadProfile, setFollow, type ProfileView } from "@/profile/load";
import { loadUserPosts, type GridPost } from "@/profile/posts";
import { toHex, alphaOf } from "@/profile/css-color";
import { Avatar } from "@/avatar";
import { VerifiedStar } from "@/glyphs";
import { Gradient } from "@/onboarding/motion";
import { base, palette, type, family, radius } from "@/theme";

/**
 * Someone's profile — the first screen reached from a PERSON rather than
 * from a tab or a post.
 *
 * Which means the first navigation that carries a username, and the first
 * screen that can be somebody else's. Both show up in what it has to
 * handle: a profile that does not exist, a private one the viewer cannot
 * see into, and the viewer's own.
 *
 * `/u/[username]`, the same path the website uses, so a link shared from
 * the site and a tap in the feed land in the same place.
 *
 * What is shared rather than reimplemented: `isLocked` (a pending request
 * does not unlock anything), the follow state machine, `hueFromId`,
 * `pronounLabel`, and the banner's colours — read out of the web's own CSS
 * by @hypefy/core/banner-colors rather than retyped.
 */
export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { username } = useLocalSearchParams<{ username: string }>();
  const [view, setView] = useState<ProfileView | null>(null);
  const [posts, setPosts] = useState<GridPost[]>([]);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [state, setState] = useState<FollowState>("none");
  const [pending, setPending] = useState(false);
  const [followError, setFollowError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getUser();
      const viewerId = data.user?.id ?? null;
      const found = await loadProfile(supabase as never, username, viewerId);
      if (!found) return { kind: "missing" as const };
      /*
       * The grid is only asked for when it can be shown. A locked account
       * would return nothing anyway — RLS refuses it — and asking makes
       * "private" and "empty" indistinguishable in the one place where
       * the difference is the whole point.
       */
      const grid = found.locked
        ? []
        : await loadUserPosts(supabase as never, found.profile.id);
      return { kind: "ok" as const, view: found, posts: grid };
    } catch (e) {
      return {
        kind: "failed" as const,
        message: e instanceof Error ? e.message : "Could not load this profile.",
      };
    }
  }, [username]);

  const apply = useCallback((result: Awaited<ReturnType<typeof fetchAll>>) => {
    if (result.kind === "missing") {
      setMissing(true);
      return;
    }
    if (result.kind === "failed") {
      setError(result.message);
      return;
    }
    setError(null);
    setMissing(false);
    setView(result.view);
    setPosts(result.posts);
    setState(result.view.state);
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

  const toggleFollow = useCallback(() => {
    if (pending || !view) return;
    const before = state;
    setPending(true);
    setFollowError(null);
    // Optimistic, and corrected from the RPC — a follow of a private
    // account comes back as "requested".
    setState(optimisticFollow(before));

    void (async () => {
      const result = await setFollow(
        supabase as never,
        followAction(before),
        view.profile.id,
      );
      if ("error" in result) {
        /*
         * Put back, and said. The web's note is the reason: a follow that
         * silently reverts is the one failure that quietly produces an
         * empty feed later.
         */
        setState(before);
        setFollowError(result.error);
      } else if (followAction(before) === "follow_user") {
        setState(settleFollow(result.raw));
      }
      setPending(false);
    })();
  }, [pending, view, state]);

  if (missing) {
    return (
      <Shell insets={insets} title="Profile">
        <View style={base.centre}>
          <Text style={base.title}>No such profile</Text>
          <Text style={[base.body, styles.gap]}>
            @{username} either does not exist or has not finished setting up.
          </Text>
        </View>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell insets={insets} title="Profile">
        <View style={base.centre}>
          <Text style={base.title}>Could not load this profile</Text>
          <Text style={[base.body, styles.gap]}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Try again"
            style={styles.retry}
            onPress={() => void fetchAll().then(apply)}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      </Shell>
    );
  }

  if (!view) {
    return (
      <Shell insets={insets} title="Profile">
        <View style={base.centre}>
          <ActivityIndicator color={palette.accent} />
        </View>
      </Shell>
    );
  }

  const p = view.profile;
  const name = p.display_name || p.username || "Someone";
  const pronouns = pronounLabel(p.pronouns);
  const colors = bannerColors(p.banner_id);
  const tags = p.profile_tags ?? [];

  return (
    <Shell insets={insets} title={p.username ? `@${p.username}` : "Profile"}>
      <FlatList
        data={view.locked ? [] : posts}
        keyExtractor={(post) => post.id}
        numColumns={3}
        renderItem={({ item }) => (
          <View style={styles.cell}>
            {item.media_url ? (
              <Image
                source={{ uri: item.media_url }}
                style={styles.cellImage}
                resizeMode="cover"
                accessibilityLabel={`Post by ${name}`}
              />
            ) : (
              /* A text-only post still takes a tile, with its words, rather
                 than a blank square. */
              <Text style={styles.cellText} numberOfLines={5}>
                {item.caption}
              </Text>
            )}
          </View>
        )}
        ListHeaderComponent={
          <View>
            {/* Banner — its gradient's two colours, drawn with SVG. */}
            <View style={[styles.banner, { backgroundColor: colors.base }]}>
              {colors.accent && (
                <Gradient
                  x2={0.6}
                  y2={1}
                  stops={[
                    { offset: 0, color: toHex(colors.accent), opacity: alphaOf(colors.accent) },
                    { offset: 0.55, color: toHex(colors.base), opacity: 0 },
                    { offset: 1, color: toHex(colors.base), opacity: 0 },
                  ]}
                />
              )}
            </View>

            <View style={styles.body}>
              <View style={styles.topRow}>
                <View style={styles.avatarRing}>
                  <Avatar name={name} hue={view.hue} size={AVATAR} />
                </View>
                <View style={styles.stats}>
                  <Stat n={view.stats.posts} label="Posts" />
                  <Stat n={view.stats.followers} label="Followers" />
                  <Stat n={view.stats.following} label="Following" />
                </View>
              </View>

              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>
                  {name}
                </Text>
                {p.is_verified && <VerifiedStar size={16} />}
              </View>
              <Text style={styles.handle}>
                @{p.username}
                {pronouns ? ` · ${pronouns}` : ""}
              </Text>
              {p.bio ? <Text style={styles.bio}>{p.bio}</Text> : null}

              {tags.length > 0 && (
                <View style={styles.tags}>
                  {tags.map((t) => (
                    <View key={t} style={styles.tag}>
                      <Text style={styles.tagText}>{t}</Text>
                    </View>
                  ))}
                </View>
              )}

              {!view.isOwn && (
                <>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={followLabel(state)}
                    accessibilityState={{ selected: state !== "none", busy: pending }}
                    disabled={pending}
                    onPress={toggleFollow}
                    style={({ pressed }) => [
                      styles.follow,
                      state !== "none" && styles.followOn,
                      pending && styles.followBusy,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.followText, state !== "none" && styles.followTextOn]}>
                      {followLabel(state)}
                    </Text>
                  </Pressable>
                  {followError && <Text style={styles.followErrorText}>{followError}</Text>}
                </>
              )}

              {view.locked && (
                <View style={styles.locked}>
                  <Lock size={22} color={palette.muted} />
                  <Text style={styles.lockedTitle}>This account is private</Text>
                  <Text style={styles.lockedBody}>
                    {state === "requested"
                      ? "Your request is waiting to be accepted."
                      : "Follow to see their posts."}
                  </Text>
                </View>
              )}

              {/*
                * Said rather than left as an unexplained mismatch: the
                * Posts count includes Shots, as it does on the website,
                * and this grid is posts only — so the number can be
                * larger than the tiles below it.
                */}
              {!view.locked && posts.length > 0 && view.stats.posts > posts.length && (
                <Text style={styles.gridNote}>
                  Showing posts. The count includes Shots, which are not here yet.
                </Text>
              )}
            </View>
          </View>
        }
        ListEmptyComponent={
          view.locked ? undefined : (
            <View style={styles.empty}>
              <Text style={base.body}>Nothing posted yet.</Text>
            </View>
          )
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      />
    </Shell>
  );
}

function Shell({
  insets,
  title,
  children,
}: {
  insets: { top: number };
  title: string;
  children: React.ReactNode;
}) {
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
        <Text style={styles.barTitle} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.back} />
      </View>
      {children}
    </View>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statN}>{formatCount(n)}</Text>
      <Text style={styles.statL}>{label}</Text>
    </View>
  );
}

const AVATAR = 72;

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  barTitle: {
    flex: 1,
    textAlign: "center",
    color: palette.foreground,
    fontFamily: family.bold,
    fontSize: type.base,
  },

  banner: { height: 120, width: "100%", overflow: "hidden" },
  body: { paddingHorizontal: 16, paddingBottom: 12 },

  topRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  avatarRing: {
    marginTop: -36,
    borderRadius: 24,
    borderWidth: 4,
    borderColor: palette.background,
    overflow: "hidden",
  },
  stats: { flexDirection: "row", gap: 18, paddingBottom: 4 },
  stat: { alignItems: "center" },
  statN: { color: palette.foreground, fontFamily: family.bold, fontSize: type.sm },
  statL: { color: palette.muted, fontFamily: family.normal, fontSize: type.tiny },

  nameRow: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 6 },
  name: {
    color: palette.foreground,
    fontFamily: family.bold,
    fontSize: 19,
    flexShrink: 1,
  },
  handle: { color: palette.muted, fontFamily: family.normal, fontSize: type.sm },
  bio: {
    marginTop: 8,
    color: palette.foreground,
    fontFamily: family.normal,
    fontSize: type.sm,
    lineHeight: 19.6,
  },

  tags: { marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.elevated,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: { color: palette.foreground, fontFamily: family.medium, fontSize: type.xs },

  follow: {
    marginTop: 14,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: palette.accent,
  },
  // Following is a state you are already in, so it is quieter than Follow —
  // the web's own reasoning, and its own test says so.
  followOn: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: palette.border,
  },
  followBusy: { opacity: 0.6 },
  pressed: { transform: [{ scale: 0.98 }] },
  followText: { color: palette.accentInk, fontFamily: family.bold, fontSize: type.sm },
  followTextOn: { color: palette.foreground },
  followErrorText: {
    marginTop: 8,
    color: palette.danger,
    fontFamily: family.normal,
    fontSize: type.xs,
  },

  locked: { marginTop: 24, alignItems: "center", gap: 6, paddingBottom: 12 },
  lockedTitle: { color: palette.foreground, fontFamily: family.bold, fontSize: type.base },
  lockedBody: {
    color: palette.muted,
    fontFamily: family.normal,
    fontSize: type.sm,
    textAlign: "center",
  },

  gridNote: {
    marginTop: 14,
    color: palette.muted,
    fontFamily: family.normal,
    fontSize: type.tiny,
  },

  cell: { flex: 1 / 3, aspectRatio: 1, padding: 1, backgroundColor: palette.background },
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
