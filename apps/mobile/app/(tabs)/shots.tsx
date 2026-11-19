import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, router } from "expo-router";
import { VideoView, useVideoPlayer } from "expo-video";
import { navSpace } from "@hypefy/tokens";
import { formatCount } from "@hypefy/core/format";
import { supabase } from "@/supabase";
import { loadShots, trimOf, type Shot } from "@/shots/load";
import { Avatar } from "@/avatar";
import { HypeIcon, CommentIcon, ShareIcon, VerifiedStar } from "@/glyphs";
import { useHype } from "@/feed/useHype";
import { base, palette, type, family, radius } from "@/theme";

/**
 * Shots — the first screen that needs a native module.
 *
 * **This is why the over-the-air run ended.** `expo-video` is native
 * code, so the JS that imports it cannot run inside the binary installed
 * before it existed. `app.json`'s version went to 1.1.0 in the same
 * change, which moves `runtimeVersion` with it: updates published from
 * now are served only to 1.1.0 builds, and the 1.0.0 app on a device
 * keeps what it has instead of being handed JS that would crash it.
 *
 * One page per Shot, paged by the screen's own height rather than by a
 * guess — a reel that stops between two clips is the thing that makes a
 * player feel broken.
 *
 * **Only the Shot on screen plays, and only while this tab is on
 * screen.** Both halves matter: a decoder per off-screen clip is how a
 * phone's video pipeline runs out (the web's own notes put the WebView
 * ceiling at 6-16 concurrent decoders), and audio from a tab nobody is
 * looking at is worse than no audio.
 */
export default function Shots() {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [shots, setShots] = useState<Shot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState(0);
  const [focused, setFocused] = useState(true);

  /*
   * Shots is the one tab with no header, so it pads for its own notch —
   * the navigator starts every other scene below TopBar. The bar's room
   * at the bottom is the shared figure, as everywhere else.
   */
  const pageHeight = height - navSpace(insets.bottom);

  const fetchAll = useCallback(async (): Promise<
    { kind: "ok"; shots: Shot[] } | { kind: "failed"; message: string } | { kind: "signed-out" }
  > => {
    try {
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError || !data.user) return { kind: "signed-out" };
      return { kind: "ok", shots: await loadShots(supabase as never, data.user.id) };
    } catch (e) {
      return {
        kind: "failed",
        message: e instanceof Error ? e.message : "Could not load Shots.",
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
    setShots(result.shots);
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

  /*
   * Leaving the tab stops the sound. `useFocusEffect` fires on blur as
   * well as focus, which a plain effect does not — a tab navigator keeps
   * the scene mounted, so without this the audio follows you to Home.
   */
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  /*
   * The viewability callback, typed from the list itself.
   *
   * `ViewToken` is not exported from react-native in this version — it
   * comes from @react-native/virtualized-lists as `ListViewToken` — and
   * the prop knows its own shape, so taking the type from the prop is
   * both shorter and immune to that moving again.
   */
  type Viewable = NonNullable<
    React.ComponentProps<typeof FlatList>["onViewableItemsChanged"]
  >;
  /*
   * A lazy useState, not `useRef(...).current`.
   *
   * The ref form is what most React Native examples use and
   * react-hooks/refs rejects it: reading `.current` during render is the
   * thing the rule exists to stop. The initialiser runs once either way,
   * so the identity is just as stable — and FlatList requires that
   * stability, because changing this prop mid-list throws.
   *
   * The carousel hit the same rule in #72 and this is the same fix.
   */
  const [onViewable] = useState<Viewable>(
    // Wrapped in an arrow that RETURNS the handler: useState treats a
    // function argument as a lazy initialiser, so passing the handler
    // directly would call it with no arguments instead of storing it.
    (): Viewable =>
      ({ viewableItems }) => {
        const first = viewableItems[0];
        if (first?.index != null) setCurrent(first.index);
      },
  );

  /*
   * 80%, so a clip counts as current only when it is most of the screen.
   * At 50% a slow swipe makes two clips viewable at once and both would
   * take a turn at being "the one playing".
   */
  const [viewabilityConfig] = useState(() => ({ itemVisiblePercentThreshold: 80 }));

  if (error) {
    return (
      <View style={[base.screen, base.centre, { paddingTop: insets.top }]}>
        <Text style={base.title}>Could not load Shots</Text>
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
    );
  }

  if (!shots) {
    return (
      <View style={[base.screen, base.centre]}>
        <ActivityIndicator color={palette.accent} />
      </View>
    );
  }

  if (shots.length === 0) {
    return (
      <View style={[base.screen, base.centre, { paddingTop: insets.top }]}>
        <Text style={base.title}>No Shots yet</Text>
        <Text style={[base.body, styles.gap]}>
          When people post Shots they turn up here. Swipe down to check again.
        </Text>
      </View>
    );
  }

  return (
    <View style={base.screen}>
      <FlatList
        data={shots}
        keyExtractor={(s) => s.id}
        renderItem={({ item, index }) => (
          <Reel
            shot={item}
            height={pageHeight}
            topInset={insets.top}
            active={index === current && focused}
          />
        )}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={pageHeight}
        snapToAlignment="start"
        decelerationRate="fast"
        getItemLayout={(_, index) => ({
          length: pageHeight,
          offset: pageHeight * index,
          index,
        })}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={viewabilityConfig}
        // One ahead and one behind: enough that a swipe lands on a loaded
        // page, few enough that no stack of decoders builds up.
        windowSize={3}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        removeClippedSubviews
      />
    </View>
  );
}

function Reel({
  shot,
  height,
  topInset,
  active,
}: {
  shot: Shot;
  height: number;
  topInset: number;
  active: boolean;
}) {
  const trim = trimOf(shot);
  const hype = useHype(shot.id, shot.user_id, {
    hyped: false,
    count: shot.hype_count ?? 0,
  });

  const player = useVideoPlayer(shot.media_url, (p) => {
    p.loop = true;
    p.muted = false;
    // A trimmed Shot starts where its author said it starts. Seeking
    // before play rather than after avoids a frame of the cut-off head.
    if (trim.start > 0) p.currentTime = trim.start;
  });

  useEffect(() => {
    if (active) player.play();
    else player.pause();
  }, [active, player]);

  /*
   * The end of a trim. expo-video loops the WHOLE file, so a Shot trimmed
   * to its first three seconds would run on into the part the author cut
   * — which is often exactly what they did not want seen. Polled rather
   * than driven by an event, because there is no "reached time" event to
   * subscribe to.
   */
  useEffect(() => {
    if (!active || trim.end === null) return;
    const timer = setInterval(() => {
      if (player.currentTime >= (trim.end ?? Infinity)) player.currentTime = trim.start;
    }, 250);
    return () => clearInterval(timer);
  }, [active, player, trim.end, trim.start]);

  const profile = shot.profiles;
  const name = profile?.display_name || profile?.username || "Someone";

  return (
    <View style={[styles.page, { height }]}>
      <VideoView
        player={player}
        style={styles.video}
        contentFit="cover"
        nativeControls={false}
        // The poster is what the author's own thumbnail is for; without
        // it a Shot is a black rectangle until the first frame decodes.
        accessibilityLabel={`Shot by ${name}`}
      />

      {/* The poster, under the video, so the page is never black. */}
      {shot.poster_url && (
        <Image
          source={{ uri: shot.poster_url }}
          style={styles.poster}
          resizeMode="cover"
          accessibilityLabel={`Shot by ${name}`}
        />
      )}

      {/* Actions, as the feed draws them */}
      <View style={[styles.rail, { bottom: 120 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={hype.state.hyped ? "Remove your hype" : "Hype this Shot"}
          accessibilityState={{ selected: hype.state.hyped, busy: hype.pending }}
          hitSlop={8}
          onPress={hype.toggle}
          style={styles.railItem}
        >
          <HypeIcon
            size={30}
            color={hype.state.hyped ? palette.hype : palette.foreground}
            fill={hype.state.hyped ? palette.hype : "none"}
          />
          <Text style={styles.railCount}>{formatCount(hype.state.count)}</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Comments, ${formatCount(shot.comment_count ?? 0)}`}
          hitSlop={8}
          onPress={() =>
            router.push({
              pathname: "/post/[id]/comments",
              params: { id: shot.id, owner: shot.user_id },
            })
          }
          style={styles.railItem}
        >
          <CommentIcon size={27} color={palette.foreground} strokeWidth={2.2} />
          <Text style={styles.railCount}>{formatCount(shot.comment_count ?? 0)}</Text>
        </Pressable>

        {/* Sharing is a write and a sheet of its own; a count, not a
            button, until it is one. */}
        <View style={styles.railItem}>
          <ShareIcon size={25} color={palette.foreground} />
        </View>
      </View>

      {/* Author and caption */}
      <View style={[styles.foot, { paddingBottom: 24 }]}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${name}'s profile`}
          disabled={!profile?.username}
          onPress={() =>
            profile?.username &&
            router.push({ pathname: "/u/[username]", params: { username: profile.username } })
          }
          style={styles.footRow}
        >
          <Avatar name={name} hue={profile?.avatar_hue ?? 200} size={34} />
          <Text style={styles.handle} numberOfLines={1}>
            @{profile?.username ?? name}
          </Text>
          {profile?.is_verified && <VerifiedStar size={13} />}
        </Pressable>
        {shot.caption ? (
          <Text style={styles.caption} numberOfLines={2}>
            {shot.caption}
          </Text>
        ) : null}
      </View>

      {/* The notch, over the video rather than beside it — this tab has no
          header, so nothing else reserves that space. */}
      <View style={[styles.notch, { height: topInset }]} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { width: "100%", backgroundColor: "#000000" },
  video: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  // Behind the video: the player draws over it once a frame is ready.
  poster: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, zIndex: -1 },
  notch: { position: "absolute", left: 0, right: 0, top: 0 },

  rail: { position: "absolute", right: 10, alignItems: "center", gap: 18 },
  railItem: { alignItems: "center", gap: 4 },
  railCount: {
    color: palette.foreground,
    fontFamily: family.semibold,
    fontSize: type.tiny,
  },

  foot: { position: "absolute", left: 0, right: 64, bottom: 0, paddingHorizontal: 16 },
  footRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  handle: {
    color: palette.foreground,
    fontFamily: family.bold,
    fontSize: type.sm,
    flexShrink: 1,
  },
  caption: {
    marginTop: 6,
    color: "rgba(255, 255, 255, 0.9)",
    fontFamily: family.normal,
    fontSize: type.sm,
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
