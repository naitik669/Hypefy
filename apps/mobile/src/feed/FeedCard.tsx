import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { MoreHorizontal, Bookmark } from "lucide-react-native";
import { router } from "expo-router";
import { formatCount } from "@hypefy/core/format";
import { timeAgoShort } from "@hypefy/core/time";
import { palette, type, family } from "@/theme";
import { HypeIcon, CommentIcon, ShareIcon, VerifiedStar } from "@/glyphs";
import { Avatar } from "@/avatar";
import { useHype } from "@/feed/useHype";
import type { FeedPost } from "@/feed/load";

/**
 * One post in the feed, ported from the web's FeedCard.
 *
 * The web's card is 1,617 lines because it carries every interaction a
 * post has: hyping with particles, double-tap, the gallery, polls, the
 * comments sheet, the actions sheet, rehype, save, ghost share, edit,
 * impressions. This is the card's SHAPE and its figures — header, media,
 * actions, caption — with the measurements read off that file: gap-3 and
 * px-4 py-3 on the header, a 40 avatar, mx-4 and rounded-2xl on the media,
 * px-4 pt-3 with gap-5 between groups and gap-1.5 inside one, and the
 * icons at 23/22/21 as the web draws them.
 *
 * **Hyping works. The other three do not, and do not pretend to.**
 * Comment, share and save are writes with no handler, rendered as the
 * counts they are, and a test asserts none has quietly gained one — a
 * button that looks live and does nothing is worse than a plain number.
 *
 * Hype goes through `useHype`, whose three rules live in
 * @hypefy/core/hype and are shared with the web's own card. What is NOT
 * here is the web's celebration: the particle burst, the break animation
 * when a hype is taken back, and the haptic tap. Those are the reason
 * hyping feels like something on the site, and they are deliberately a
 * separate piece of work rather than approximated badly — the star fills,
 * the count turns, and a failure puts both back.
 *
 * `formatCount` and `timeAgoShort` come from @hypefy/core, so "1.2k" and
 * "5m" are formatted by the same code on both clients rather than by two
 * functions that round the same way today.
 */

/** The web's icon sizes, which are deliberately uneven. */
const HYPE = 23;
const COMMENT = 22;
const SHARE = 21;
const SAVE = 21;
const AVATAR = 40;

/** Opens a profile, when there is a username to open. */
function openProfile(username: string | null | undefined) {
  if (!username) return;
  router.push({ pathname: "/u/[username]", params: { username } });
}

export function FeedCard({ post, hyped = false }: { post: FeedPost; hyped?: boolean }) {
  const hype = useHype(post.id, post.user_id, {
    hyped,
    count: post.hype_count ?? 0,
  });
  const profile = post.profiles;
  const name = profile?.display_name || profile?.username || "Someone";
  const media = post.media_urls?.[0] ?? post.media_url ?? null;

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.head}>
        {/*
         * Their face takes you to them, as it does on the web — where the
         * same tap goes to their Show while one is live. Shows are not
         * ported, so this always goes to the profile, which is the web's
         * own fallback rather than a different destination.
         *
         * Disabled when the author has no username: /u/[username] has
         * nothing to resolve, and a tap that lands on "no such profile"
         * is worse than one that does nothing.
         */}
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${name}'s profile`}
          disabled={!profile?.username}
          onPress={() => openProfile(profile?.username)}
          style={({ pressed }) => [pressed && styles.pressed]}
        >
          <Avatar name={name} hue={profile?.avatar_hue ?? 200} size={AVATAR} />
        </Pressable>
        <View style={styles.who}>
          {/*
           * Plain, as the web's card is, and its reason is worth keeping:
           * a name font and a glow are for the places a person is the
           * subject. Six different faces down one scroll reads as six
           * different apps.
           */}
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`${name}'s profile`}
            disabled={!profile?.username}
            onPress={() => openProfile(profile?.username)}
            style={styles.nameTap}
          >
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
          </Pressable>
          {profile?.is_verified && <VerifiedStar size={14} />}
          <Text style={styles.when}>· {timeAgoShort(post.created_at)}</Text>
        </View>
        {/* The menu's seat, reserved and inert: its sheet is not ported, and
            a button that opens nothing is worse than an empty space. */}
        <View style={styles.menu}>
          <MoreHorizontal size={20} color={palette.muted} />
        </View>
      </View>

      {/* Media */}
      {media && (
        <View style={styles.media}>
          {/*
            * Labelled, because an unlabelled photograph is the whole post
            * to a screen reader. Alt text per post does not exist in the
            * schema — it is on the launch list as a later feature — so the
            * author is the one true thing there is to say, and the caption
            * below is read as its own text.
            */}
          <Image
            source={{ uri: media }}
            style={styles.mediaImage}
            resizeMode="cover"
            accessibilityLabel={`Photo from ${name}`}
          />
        </View>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <View style={styles.group}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hype.state.hyped ? "Remove your hype" : "Hype this post"}
            accessibilityState={{ selected: hype.state.hyped, busy: hype.pending }}
            hitSlop={8}
            onPress={hype.toggle}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          >
            <HypeIcon
              size={HYPE}
              color={hype.state.hyped ? palette.hype : palette.foreground}
              fill={hype.state.hyped ? palette.hype : "none"}
            />
            <Text style={[styles.count, hype.state.hyped && styles.countOn]}>
              {formatCount(hype.state.count)}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Comments, ${formatCount(post.comment_count ?? 0)}`}
            hitSlop={8}
            onPress={() =>
              router.push({
                pathname: "/post/[id]/comments",
                // The post's AUTHOR, carried through: create_comment writes
                // the notification and needs to know who to tell. The
                // screen refuses to post without it rather than guessing.
                params: { id: post.id, owner: post.user_id },
              })
            }
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          >
            <CommentIcon size={COMMENT} color={palette.foreground} strokeWidth={2.2} />
            <Text style={styles.count}>{formatCount(post.comment_count ?? 0)}</Text>
          </Pressable>
          <View style={styles.action}>
            <ShareIcon size={SHARE} color={palette.foreground} />
            <Text style={styles.count}>{formatCount(post.share_count ?? 0)}</Text>
          </View>
        </View>
        <View style={styles.group}>
          <View style={styles.action}>
            <Bookmark size={SAVE} color={palette.foreground} />
          </View>
        </View>
      </View>

      {/* Caption */}
      {post.caption ? (
        <Text style={styles.caption} numberOfLines={4}>
          {post.caption}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * A post whose author or media has not arrived, so the row is skipped.
 *
 * Exported so the list can use it rather than rendering a half card. A
 * post with no media and no caption is a row with nothing in it.
 */
export function isRenderable(post: FeedPost): boolean {
  const media = post.media_urls?.[0] ?? post.media_url ?? null;
  return Boolean(media) || Boolean(post.caption?.trim());
}

const styles = StyleSheet.create({
  // border-b border-border/50 pb-3
  card: {
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(42, 42, 42, 0.5)",
  },

  // flex items-center gap-3 px-4 py-3
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  // min-w-0 flex-1 items-center gap-1
  who: { flex: 1, flexDirection: "row", alignItems: "center", gap: 4 },
  // The name's own tap target, which must not grow the row: it shrinks
  // with the name rather than claiming the whole remaining width, so the
  // timestamp beside it stays beside it.
  nameTap: { flexShrink: 1 },
  name: {
    color: palette.foreground,
    fontFamily: family.semibold,
    fontSize: type.sm, // text-sm
    flexShrink: 1,
  },
  when: { color: palette.muted, fontFamily: family.normal, fontSize: type.sm },
  // -mr-1 h-10 w-10, centred
  menu: {
    marginRight: -4,
    height: 40,
    width: 40,
    alignItems: "center",
    justifyContent: "center",
  },

  // mx-4 overflow-hidden rounded-2xl
  media: {
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: palette.elevated,
  },
  // The web lets the image set its own aspect; a square is the shape the
  // composer crops to and the one the onboarding mock-up shows.
  mediaImage: { width: "100%", aspectRatio: 1 },

  // flex items-center justify-between px-4 pt-3
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  group: { flexDirection: "row", alignItems: "center", gap: 20 }, // gap-5
  action: { flexDirection: "row", alignItems: "center", gap: 6 }, // gap-1.5
  // active:scale-90, which is what the web's own hype button presses to.
  pressed: { transform: [{ scale: 0.9 }] },
  count: {
    color: palette.foreground,
    fontFamily: family.semibold,
    fontSize: type.sm, // text-sm font-semibold
    fontVariant: ["tabular-nums"], // tabular-nums
  },
  // text-hype once it is yours, as the web's count turns.
  countOn: { color: palette.hype },

  // px-4 pt-2 text-sm leading-snug
  caption: {
    paddingHorizontal: 16,
    paddingTop: 8,
    color: palette.foreground,
    fontFamily: family.normal,
    fontSize: type.sm,
    lineHeight: 19.6, // leading-snug on 14px
  },
});
