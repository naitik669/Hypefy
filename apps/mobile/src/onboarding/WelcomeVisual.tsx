import { Image, StyleSheet, Text, View } from "react-native";
import { Bell, Compass } from "lucide-react-native";
import { palette, type, family, radius } from "@/theme";
import { HypeIcon, CommentIcon, ShareIcon } from "@/glyphs";

/**
 * The welcome slide's app preview — the phone-in-a-phone mock-up.
 *
 * Ported from WelcomeVisual in the web's IntroCarousel, measurement for
 * measurement. The card is 212 wide with a 28 radius, the rings are 26
 * square inside a 1.5 accent border, the post image is square, and the
 * hype badge hangs 24 off the right edge at 42% down. Every one of those
 * is the web's number, not a judgement.
 *
 * The images are the WEB'S files, imported across the workspace rather
 * than copied into this app. Metro watches the repo root (see
 * metro.config.js), so `../../../../public/onboarding/...` resolves and
 * bundles. Copying them would have meant 600KB duplicated and two sets to
 * keep in step; this way there is one file and it cannot drift.
 *
 * **One thing is missing on purpose.** The web puts a soft glow behind the
 * card — `bg-accent/10` with `blur-3xl`. React Native has no filter, and a
 * 10%-accent rectangle with hard edges looks worse than no glow at all, so
 * there is none until there is a reason to add expo-blur. It is the one
 * visible difference from the site on this slide, and it is a subtraction
 * rather than a substitution.
 */

import jayPfp from "../../../../public/onboarding/jay-pfp.webp";
import disc9 from "../../../../public/onboarding/disc9.webp";
import adaPfp from "../../../../public/onboarding/ada-pfp.webp";
import disc6 from "../../../../public/onboarding/disc6.webp";
import maya from "../../../../public/onboarding/maya.webp";
import postSample from "../../../../public/onboarding/post-sample.jpg";

/**
 * The Shows row.
 *
 * The web gives each face an `object-position` — `50% 16%`, `50% 32%` and
 * so on — to keep a head in frame that a centre crop would cut. React
 * Native's `resizeMode: "cover"` always centres, and there is no
 * object-position equivalent short of over-sizing the image inside the
 * clip and offsetting it by hand.
 *
 * Not done, and said plainly rather than left looking done: at 26 square
 * on a source that is close to square, a centre crop and a 16%-from-top
 * crop differ by a pixel or two. If these ever read as badly cropped on a
 * device that is the thing to fix, and the web's values are the ones to
 * fix it to.
 */
const RINGS = [jayPfp, disc9, adaPfp, disc6] as const;

const RING_INNER = 26;
const CARD_W = 212;

export function WelcomeVisual() {
  return (
    <View>
      <View style={styles.card}>
        {/* Top bar */}
        <View style={styles.cardBar}>
          <Text style={styles.cardMark}>
            Hypefy<Text style={styles.cardMarkDot}>.</Text>
          </Text>
          <View style={styles.cardBarIcons}>
            <Compass size={13} color={palette.faint} />
            <View>
              <Bell size={13} color={palette.faint} />
              <View style={styles.bellDot} />
            </View>
          </View>
        </View>

        {/* Shows row — squircle rings in solid accent, as the real one is. */}
        <View style={styles.rings}>
          {RINGS.map((img, i) => (
            <View key={i} style={styles.ringOuter}>
              <View style={styles.ringInner}>
                <View style={styles.ringClip}>
                  <Image source={img} style={styles.ringImg} resizeMode="cover" />
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* A post */}
        <View style={styles.post}>
          <View style={styles.postHead}>
            <View style={styles.postAvatar}>
              <Image source={maya} style={styles.fill} resizeMode="cover" />
            </View>
            <View style={styles.postMeta}>
              <View style={styles.barWide} />
              <View style={styles.barNarrow} />
            </View>
          </View>

          <View style={styles.postImage}>
            <Image source={postSample} style={styles.fill} resizeMode="cover" />
          </View>

          <View style={styles.actions}>
            <View style={styles.hypeCount}>
              <HypeIcon size={17} color={palette.hype} fill={palette.hype} />
              <Text style={styles.hypeText}>2.4k</Text>
            </View>
            <CommentIcon size={15} color={palette.muted} />
            <ShareIcon size={14} color={palette.muted} />
          </View>
        </View>
      </View>

      {/* Hype badge popping off the corner */}
      <View style={styles.badge}>
        <HypeIcon size={15} color={palette.hype} fill={palette.hype} />
        <Text style={styles.badgeText}>2.4k Hypes</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_W, // w-[212px]
    borderRadius: 28, // rounded-[28px]
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    overflow: "hidden",
  },

  cardBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12, // px-3
    paddingTop: 12, // pt-3
    paddingBottom: 6, // pb-1.5
  },
  cardMark: {
    color: palette.foreground,
    fontFamily: family.extrabold,
    fontSize: 13, // text-[13px]
    letterSpacing: -0.33,
  },
  cardMarkDot: { color: palette.accent },
  cardBarIcons: { flexDirection: "row", alignItems: "center", gap: 8 }, // gap-2
  bellDot: {
    position: "absolute",
    right: -2, // -right-0.5
    top: -2, // -top-0.5
    width: 6, // h-1.5 w-1.5
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.accent,
  },

  rings: {
    flexDirection: "row",
    gap: 10, // gap-2.5
    paddingHorizontal: 12,
    paddingBottom: 8, // pb-2
  },
  ringOuter: { borderRadius: 11, backgroundColor: palette.accent, padding: 1.5 },
  ringInner: { borderRadius: 10, backgroundColor: palette.background, padding: 1.5 },
  ringClip: {
    width: RING_INNER,
    height: RING_INNER,
    borderRadius: 8,
    overflow: "hidden",
  },
  ringImg: { width: "100%", height: "100%" },

  post: { paddingHorizontal: 12, paddingBottom: 12 }, // px-3 pb-3
  postHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8, // gap-2
    paddingVertical: 6, // py-1.5
  },
  postAvatar: { width: 22, height: 22, borderRadius: 7, overflow: "hidden" },
  postMeta: { flex: 1 },
  barWide: {
    height: 6, // h-1.5
    width: 64, // w-16
    borderRadius: 3,
    backgroundColor: palette.elevated,
  },
  barNarrow: {
    marginTop: 4, // mt-1
    height: 6,
    width: 36, // w-9
    borderRadius: 3,
    backgroundColor: palette.elevated,
    opacity: 0.7, // bg-elevated/70
  },
  postImage: {
    width: "100%",
    aspectRatio: 1, // aspect-square
    borderRadius: 12, // rounded-xl
    backgroundColor: palette.elevated,
    overflow: "hidden",
  },
  fill: { width: "100%", height: "100%" },

  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14, // gap-3.5
    paddingTop: 8, // pt-2
  },
  hypeCount: { flexDirection: "row", alignItems: "center", gap: 4 }, // gap-1
  hypeText: {
    color: palette.foreground,
    fontFamily: family.bold,
    fontSize: 11, // text-[11px]
  },

  badge: {
    position: "absolute",
    right: -24, // -right-6
    top: "42%",
    flexDirection: "row",
    alignItems: "center",
    gap: 6, // gap-1.5
    borderRadius: radius.pill,
    borderWidth: 1,
    // border-accent/30 — the accent at 30%, not solid.
    borderColor: "rgba(163, 230, 53, 0.3)",
    backgroundColor: palette.surface,
    paddingHorizontal: 12, // px-3
    paddingVertical: 8, // py-2
  },
  badgeText: {
    color: palette.foreground,
    fontFamily: family.bold,
    fontSize: type.xs, // text-xs
  },
});
