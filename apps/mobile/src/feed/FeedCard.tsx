import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { MoreHorizontal, Bookmark } from "lucide-react-native";
import { formatCount } from "@hypefy/core/format";
import { timeAgoShort } from "@hypefy/core/time";
import { palette, type, family } from "@/theme";
import { HypeIcon, CommentIcon, ShareIcon, VerifiedStar } from "@/glyphs";
import { Avatar } from "@/avatar";
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
 * **The actions do not work yet, and they do not pretend to.** Every one of
 * them is a write — hype, comment, share, save — and a button that looks
 * live and does nothing is worse than one that says it is coming. They are
 * rendered as the counts they are, without press handlers, and a test
 * asserts no handler has quietly appeared. Hyping needs the optimistic
 * update, the RPC and the particle animation; it is its own piece of work.
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

export function FeedCard({ post }: { post: FeedPost }) {
  const profile = post.profiles;
  const name = profile?.display_name || profile?.username || "Someone";
  const media = post.media_urls?.[0] ?? post.media_url ?? null;

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.head}>
        <Avatar name={name} hue={profile?.avatar_hue ?? 200} size={AVATAR} />
        <View style={styles.who}>
          {/*
           * Plain, as the web's card is, and its reason is worth keeping:
           * a name font and a glow are for the places a person is the
           * subject. Six different faces down one scroll reads as six
           * different apps.
           */}
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
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
          <Image source={{ uri: media }} style={styles.mediaImage} resizeMode="cover" />
        </View>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <View style={styles.group}>
          <View style={styles.action}>
            <HypeIcon size={HYPE} color={palette.foreground} />
            <Text style={styles.count}>{formatCount(post.hype_count ?? 0)}</Text>
          </View>
          <View style={styles.action}>
            <CommentIcon size={COMMENT} color={palette.foreground} strokeWidth={2.2} />
            <Text style={styles.count}>{formatCount(post.comment_count ?? 0)}</Text>
          </View>
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
  count: {
    color: palette.foreground,
    fontFamily: family.semibold,
    fontSize: type.sm, // text-sm font-semibold
    fontVariant: ["tabular-nums"], // tabular-nums
  },

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
