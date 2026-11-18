import { Image, StyleSheet, Text, View } from "react-native";
import { palette, type, family } from "@/theme";
import { ShareIcon, VerifiedStar } from "@/glyphs";
import { Gradient } from "@/onboarding/motion";

/**
 * The identity slide — a lived-in profile card.
 *
 * Ported from MockProfile in the web's IntroCarousel: banner, avatar
 * overlapping it, three stats, name with the verified badge, handle, bio,
 * three tags, four recent posts and the two actions. 300 wide at radius
 * 26, like the hero post on the posts slide.
 *
 * The copy — the name, handle, bio, tag words, stat figures and labels —
 * is checked against the web's source in both directions, so a word
 * changed on the site fails the phone's test.
 *
 * The photographs are the WEB'S files, imported across the workspace.
 *
 * `object-position` on the avatar is the one thing left out, as on every
 * other slide: RN's cover crop always centres.
 */

import maya from "../../../../public/onboarding/maya.webp";
import postSample from "../../../../public/onboarding/post-sample.jpg";
import adaPost from "../../../../public/onboarding/ada-post.webp";
import niaPost from "../../../../public/onboarding/nia-post.jpg";
import jayPost from "../../../../public/onboarding/jay-post.jpg";

/** w-[300px] */
const CARD_W = 300;
/** h-[68px] w-[68px] on the avatar, as on the discover hub. */
const AVATAR = 68;

/** The web's tags, in the web's order. */
const TAGS = ["Creator", "Designer", "Photographer"] as const;

/** The web's four recent posts, in the web's order. */
const THUMBS = [postSample, adaPost, niaPost, jayPost] as const;

/** The web's three stats. */
const STATS = [
  { n: "128", l: "Posts" },
  { n: "12.4k", l: "Hypes" },
  { n: "843", l: "Friends" },
] as const;

export function MockProfile() {
  return (
    <View style={styles.card}>
      {/* Banner — the accent and a deep violet over a near-black ground. */}
      <View style={styles.banner}>
        <Gradient
          // 115deg: left to right with a downward lean.
          x2={1}
          y2={0.47}
          stops={[
            { offset: 0, color: "#a3e635", opacity: 0.2 },
            { offset: 0.75, color: "#6d28d9", opacity: 0.28 },
            { offset: 1, color: "#6d28d9", opacity: 0.28 },
          ]}
        />
      </View>

      <View style={styles.body}>
        {/* Avatar, overlapping the banner, beside the stats */}
        <View style={styles.topRow}>
          <View style={styles.avatar}>
            <Image source={maya} style={styles.fill} resizeMode="cover" />
          </View>
          <View style={styles.stats}>
            {STATS.map((s) => (
              <View key={s.l} style={styles.stat}>
                <Text style={styles.statN}>{s.n}</Text>
                <Text style={styles.statL}>{s.l}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Identity */}
        <View style={styles.nameRow}>
          <Text style={styles.name}>Maya Rivera</Text>
          <VerifiedStar size={16} />
        </View>
        <Text style={styles.handle}>@maya</Text>
        <Text style={styles.bio}>creator mode · late night energy ✦</Text>

        {/* Tags */}
        <View style={styles.tags}>
          {TAGS.map((t) => (
            <View key={t} style={styles.tag}>
              <Text style={styles.tagText}>{t}</Text>
            </View>
          ))}
        </View>

        {/* Recent posts */}
        <View style={styles.thumbs}>
          {THUMBS.map((src, i) => (
            <View key={i} style={styles.thumb}>
              <Image source={src} style={styles.fill} resizeMode="cover" />
            </View>
          ))}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <View style={styles.primary}>
            <Text style={styles.primaryText}>Edit profile</Text>
          </View>
          <View style={styles.secondary}>
            <ShareIcon size={15} color={palette.muted} />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_W,
    borderRadius: 26, // rounded-[26px]
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    overflow: "hidden",
    // shadow-2xl, as one shadow rather than four.
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 14 },
    elevation: 20,
  },

  // h-16 w-full, over #121212
  banner: { height: 64, width: "100%", backgroundColor: "#121212" },

  body: { paddingHorizontal: 16, paddingBottom: 16 }, // px-4 pb-4

  // flex items-end justify-between
  topRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  avatar: {
    marginTop: -36, // -mt-9
    width: AVATAR,
    height: AVATAR,
    borderRadius: 22, // rounded-[22px]
    overflow: "hidden",
    borderWidth: 4, // ring-4
    borderColor: palette.surface, // ring-surface
  },
  stats: { flexDirection: "row", gap: 16, paddingBottom: 2 }, // gap-4 pb-0.5
  stat: { alignItems: "center" },
  statN: {
    color: palette.foreground,
    fontFamily: family.bold,
    fontSize: type.sm, // text-sm
    lineHeight: 15.4, // leading-tight
  },
  statL: {
    color: palette.muted,
    fontFamily: family.normal,
    fontSize: type.tiny, // text-[10px]
  },

  nameRow: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 6 }, // mt-2.5 gap-1.5
  name: {
    color: palette.foreground,
    fontFamily: family.bold,
    fontSize: 17, // text-[17px]
    lineHeight: 18.7, // leading-tight
  },
  handle: {
    color: palette.muted,
    fontFamily: family.normal,
    fontSize: type.sm, // text-sm
  },
  bio: {
    marginTop: 6, // mt-1.5
    color: "rgba(255, 255, 255, 0.9)", // text-foreground/90
    fontFamily: family.normal,
    fontSize: type.sm,
    lineHeight: 19.6, // leading-snug on 14px
  },

  tags: { marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 6 }, // mt-2.5 gap-1.5
  tag: {
    borderRadius: 8, // rounded-lg
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.elevated,
    paddingHorizontal: 10, // px-2.5
    paddingVertical: 4, // py-1
  },
  tagText: {
    color: palette.foreground,
    fontFamily: family.medium,
    fontSize: type.xs, // text-xs
  },

  thumbs: { marginTop: 12, flexDirection: "row", gap: 6 }, // mt-3 gap-1.5
  thumb: {
    flex: 1,
    aspectRatio: 1, // aspect-square
    borderRadius: 8, // rounded-lg
    backgroundColor: palette.elevated,
    overflow: "hidden",
  },

  actions: { marginTop: 12, flexDirection: "row", gap: 8 }, // mt-3 gap-2
  primary: {
    height: 36, // h-9
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12, // rounded-xl
    backgroundColor: palette.accent,
  },
  primaryText: {
    color: palette.accentInk,
    fontFamily: family.bold,
    fontSize: type.xs, // text-xs
  },
  secondary: {
    height: 36, // h-9 w-9
    width: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
  },

  fill: { width: "100%", height: "100%" },
});
