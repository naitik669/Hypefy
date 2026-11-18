import { Image, StyleSheet, Text, View } from "react-native";
import { Play } from "lucide-react-native";
import { palette, type, family } from "@/theme";
import { HypeIcon, CommentIcon, ShareIcon } from "@/glyphs";
import { Float, Gradient, ReelReveal, StarPop } from "@/onboarding/motion";

/**
 * The Shots slide — the hero reel with two others peeking from behind.
 *
 * Ported from MockReel and ReelCard in the web's IntroCarousel. The three
 * card sizes (188x332, 134x238, 130x230), the offsets, the opacities and
 * every per-reel duration and delay are the web's own figures, named
 * beside each one. The card's inner proportions are the web's too: the
 * play circle is 26% of the card's width and its glyph 13%, so one set of
 * numbers sizes all three cards.
 *
 * `big` switches the hype rail's icon sizes at the web's own threshold —
 * a card wider than 150 gets 26/22/20, a narrower one 20/18/16.
 *
 * The photographs are the WEB'S files, imported across the workspace.
 *
 * Three things are missing on purpose:
 *
 *  - The play circle's `backdrop-blur-sm`. There is no filter in React
 *    Native; the circle keeps its black/35 fill without the blur behind
 *    it. expo-blur is a native module and would cost a cloud build and
 *    stop over-the-air delivery, for a 49px disc.
 *  - The reveal's `blur(8px)`, for the same reason — see motion.tsx.
 *  - `object-position` on the stills. RN's cover crop always centres.
 */

import jayPost from "../../../../public/onboarding/jay-post.jpg";
import niaPost from "../../../../public/onboarding/nia-post.jpg";
import adaPost from "../../../../public/onboarding/ada-post.webp";
import disc9 from "../../../../public/onboarding/disc9.webp";
import disc6 from "../../../../public/onboarding/disc6.webp";
import disc7 from "../../../../public/onboarding/disc7.webp";

/** Above this width a card is `big` and takes the larger icon set. */
const BIG_ABOVE = 150;

/** The play circle and its glyph, as fractions of the card's width. */
const PLAY_DISC = 0.26;
const PLAY_GLYPH = 0.13;

type ReelData = {
  readonly img: number;
  readonly pfp: number;
  readonly handle: string;
  readonly caption: string;
  readonly hypes: string;
};

/** The web's HERO_REEL. */
const HERO_REEL: ReelData = {
  img: jayPost,
  pfp: disc9,
  handle: "leo",
  caption: "golden hour ✦",
  hypes: "4.1k",
};

/** The web's BG_REELS, in the web's order. */
const BG_REELS: readonly ReelData[] = [
  { img: niaPost, pfp: disc6, handle: "mara", caption: "park days", hypes: "2.3k" },
  { img: adaPost, pfp: disc7, handle: "kit", caption: "sun nap ☀️", hypes: "3.1k" },
];

export function MockReel({ active }: { active: boolean }) {
  return (
    <View>
      {/* The two behind, each on its own clock */}
      <View style={styles.left} pointerEvents="none">
        <ReelReveal active={active} order={3}>
          <Float dur={4300} delay={600}>
            <ReelCard data={BG_REELS[0]} w={134} h={238} />
          </Float>
        </ReelReveal>
      </View>
      <View style={styles.right} pointerEvents="none">
        <ReelReveal active={active} order={4}>
          <Float dur={3600} delay={200}>
            <ReelCard data={BG_REELS[1]} w={130} h={230} />
          </Float>
        </ReelReveal>
      </View>

      {/* The hero, leading the reveal after the copy */}
      <View style={styles.hero}>
        <ReelReveal active={active} order={2}>
          <Float dur={3900} delay={0}>
            <ReelCard data={HERO_REEL} w={188} h={332} active={active} />
          </Float>
        </ReelReveal>
      </View>
    </View>
  );
}

function ReelCard({
  data,
  w,
  h,
  active = false,
}: {
  data: ReelData;
  w: number;
  h: number;
  active?: boolean;
}) {
  const big = w > BIG_ABOVE;
  const disc = w * PLAY_DISC;
  return (
    <View style={[styles.card, { width: w, height: h }]}>
      <Image source={data.img} style={StyleSheet.absoluteFill} resizeMode="cover" />

      {/* bg-gradient-to-t from-black/75 via-transparent to-black/10 — read
          downward here, so the three stops are the web's three reversed. */}
      <Gradient
        x2={0}
        y2={1}
        stops={[
          { offset: 0, color: "#000000", opacity: 0.1 },
          { offset: 0.5, color: "#000000", opacity: 0 },
          { offset: 1, color: "#000000", opacity: 0.75 },
        ]}
      />

      {/* Play */}
      <View style={styles.playSeat}>
        <View
          style={[styles.playDisc, { width: disc, height: disc, borderRadius: disc / 2 }]}
        >
          <Play
            size={w * PLAY_GLYPH}
            color={palette.foreground}
            fill={palette.foreground}
            style={styles.playGlyph}
          />
        </View>
      </View>

      {/* Hype rail */}
      <View style={styles.rail}>
        <View style={styles.railHype}>
          <StarPop active={active}>
            <HypeIcon size={big ? 26 : 20} color={palette.hype} fill={palette.hype} />
          </StarPop>
          <Text style={styles.railCount}>{data.hypes}</Text>
        </View>
        <CommentIcon size={big ? 22 : 18} color={palette.foreground} />
        <ShareIcon size={big ? 20 : 16} color={palette.foreground} />
      </View>

      {/* Author + caption */}
      <View style={styles.foot}>
        <View style={styles.footRow}>
          <View style={styles.footPfp}>
            <Image source={data.pfp} style={styles.fill} resizeMode="cover" />
          </View>
          <Text style={styles.handle}>@{data.handle}</Text>
        </View>
        <Text style={styles.caption} numberOfLines={1}>
          {data.caption}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // -left-20 top-7 opacity-50
  left: { position: "absolute", left: -80, top: 28, opacity: 0.5 },
  // -right-20 top-12 opacity-45
  right: { position: "absolute", right: -80, top: 48, opacity: 0.45 },
  // relative z-10
  hero: { zIndex: 10 },

  card: {
    borderRadius: 26, // rounded-[26px]
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.elevated,
    overflow: "hidden",
    // shadow-2xl, as one shadow rather than four.
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 14 },
    elevation: 20,
  },

  // absolute inset-0, centred — `inset-0` as four sides rather than
  // StyleSheet.absoluteFillObject, which this React Native no longer types.
  playSeat: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  playDisc: {
    alignItems: "center",
    justifyContent: "center",
    // bg-black/35. The web also blurs what is behind it; see the note above.
    backgroundColor: "rgba(0, 0, 0, 0.35)",
  },
  playGlyph: { marginLeft: 2 }, // ml-0.5

  // bottom-12 right-2.5, column, gap-3
  rail: {
    position: "absolute",
    bottom: 48,
    right: 10,
    alignItems: "center",
    gap: 12,
  },
  railHype: { alignItems: "center", gap: 2 }, // gap-0.5
  railCount: {
    color: palette.foreground,
    fontFamily: family.semibold,
    fontSize: type.tiny, // text-[10px]
  },

  // inset-x-0 bottom-0 p-3 pr-11
  foot: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 12, paddingRight: 44 },
  footRow: { flexDirection: "row", alignItems: "center", gap: 8 }, // gap-2
  footPfp: {
    width: 28, // h-7 w-7
    height: 28,
    borderRadius: 9, // rounded-[9px]
    overflow: "hidden",
    borderWidth: 2, // ring-2
    borderColor: "rgba(255, 255, 255, 0.6)", // ring-white/60
  },
  handle: {
    color: palette.foreground,
    fontFamily: family.bold,
    fontSize: type.xs, // text-xs
  },
  caption: {
    marginTop: 4, // mt-1
    color: "rgba(255, 255, 255, 0.85)", // text-white/85
    fontFamily: family.normal,
    fontSize: 11, // text-[11px]
  },

  fill: { width: "100%", height: "100%" },
});
