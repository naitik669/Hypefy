import { useEffect, useState, type ReactNode } from "react";
import { Animated, Easing, Image, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { palette, type, family } from "@/theme";
import { HypeIcon, CommentIcon, ShareIcon } from "@/glyphs";
import { Avatar } from "@/avatar";

/**
 * The posts slide's feed wall — the hero post with four others bleeding off
 * the edges, each bobbing out of sync, revealed one after another.
 *
 * Ported from MockPostStack in the web's IntroCarousel. Every offset,
 * width, opacity, duration and delay below is the web's own figure with its
 * Tailwind class or CSS value named beside it. The reveal order is the
 * web's shared timeline: header 0, body 1, maya 2, jay 3, leo and nia 4,
 * ada 5, at 170ms a step.
 *
 * The images are the WEB'S files, imported across the workspace — Metro
 * watches the repo root, so public/onboarding resolves and bundles. There
 * is one copy of each photograph and it cannot drift.
 *
 * Three things differ from the site, all of them forced:
 *
 *  - `object-position` on the photographs. React Native's cover crop always
 *    centres and there is no equivalent short of over-sizing the image
 *    inside its clip and offsetting by hand. The web nudges these a few
 *    percent off centre to keep a head in frame; at these sizes the
 *    difference is small, and it is recorded rather than hidden.
 *  - Shadows. `shadow-xl` and `shadow-2xl` are multi-layer CSS shadows;
 *    Android draws one, from `elevation`. The values below are the nearest
 *    single shadow, not a conversion.
 *  - The gradients are drawn with react-native-svg rather than CSS. Same
 *    stops, same direction.
 */

import leoPost from "../../../../public/onboarding/leo-post.jpg";
import niaPost from "../../../../public/onboarding/nia-post.jpg";
import jayPost from "../../../../public/onboarding/jay-post.jpg";
import jayPfp from "../../../../public/onboarding/jay-pfp.webp";
import adaPost from "../../../../public/onboarding/ada-post.webp";
import adaPfp from "../../../../public/onboarding/ada-pfp.webp";
import maya from "../../../../public/onboarding/maya.webp";
import postSample from "../../../../public/onboarding/post-sample.jpg";

/** 170ms a step — the web's REVEAL_GAP. */
const REVEAL_GAP = 170;

/** The bob's travel: `float-y` goes to -7px and back. */
const FLOAT_Y = -7;

/** h-[26px] w-[26px] on a background post's avatar. */
const BG_AVATAR = 26;
/** h-[42px] w-[42px] on the hero's. */
const CARD_AVATAR = 42;
/** w-[300px] — the hero card. */
const CARD_W = 300;

type BgPostData = {
  readonly name: string;
  readonly hue: number;
  readonly time: string;
  readonly hypes: string;
  readonly img: number;
  readonly avatar?: number;
};

/** The web's BG_POSTS, in the web's order. */
const BG_POSTS: readonly BgPostData[] = [
  { name: "leo", hue: 30, time: "5m", hypes: "1.2k", img: leoPost },
  { name: "nia", hue: 330, time: "12m", hypes: "3.4k", img: niaPost },
  { name: "jay", hue: 200, time: "1h", hypes: "890", img: jayPost, avatar: jayPfp },
  { name: "ada", hue: 150, time: "2h", hypes: "2.1k", img: adaPost, avatar: adaPfp },
];

export function MockPostStack({ active }: { active: boolean }) {
  return (
    <View>
      {/* Behind the hero — leo (up-left), jay (down-left), nia (right) */}
      <View style={styles.leo} pointerEvents="none">
        <Reveal active={active} order={4}>
          <Float dur={4100} delay={700}>
            <BgPost post={BG_POSTS[0]} />
          </Float>
        </Reveal>
      </View>
      <View style={styles.jay} pointerEvents="none">
        <Reveal active={active} order={3}>
          <Float dur={4400} delay={1000}>
            <BgPost post={BG_POSTS[2]} />
          </Float>
        </Reveal>
      </View>
      <View style={styles.nia} pointerEvents="none">
        <Reveal active={active} order={4}>
          <Float dur={3700} delay={300}>
            <BgPost post={BG_POSTS[1]} />
          </Float>
        </Reveal>
      </View>

      {/* The hero, nudged up and left, revealed after the copy */}
      <View style={styles.hero}>
        <Reveal active={active} order={2}>
          <Float dur={3400} delay={0}>
            <MockPostCard />
          </Float>
        </Reveal>
      </View>

      {/* In front of the hero, bigger, down-right, revealed last */}
      <View style={styles.ada} pointerEvents="none">
        <Reveal active={active} order={5}>
          <Float dur={3200} delay={500}>
            <BgPost post={BG_POSTS[3]} />
          </Float>
        </Reveal>
      </View>

      {/* Every post dissolves into the background as it nears the copy. */}
      <View style={styles.fade} pointerEvents="none">
        <Gradient
          x2={0}
          y2={1}
          stops={[
            // The web's gradient reads bottom-to-top; this one reads
            // top-to-bottom, so the stops are the same three reversed —
            // transparent at the top, solid from 58% down (100% - 42%).
            { offset: 0, color: palette.background, opacity: 0 },
            { offset: 0.58, color: palette.background, opacity: 1 },
            { offset: 1, color: palette.background, opacity: 1 },
          ]}
        />
      </View>
    </View>
  );
}

/** A background post — a smaller card, a different user. */
function BgPost({ post }: { post: BgPostData }) {
  return (
    <View style={styles.bgCard}>
      <View style={styles.bgHead}>
        {post.avatar ? (
          <View style={styles.bgAvatar}>
            <Image source={post.avatar} style={styles.fill} resizeMode="cover" />
          </View>
        ) : (
          <Avatar name={post.name} hue={post.hue} size={BG_AVATAR} />
        )}
        <View style={styles.bgMeta}>
          <Text style={styles.bgName} numberOfLines={1}>
            {post.name}
          </Text>
          <Text style={styles.bgTime}>{post.time}</Text>
        </View>
      </View>

      <View style={styles.bgImage}>
        <Image source={post.img} style={styles.fill} resizeMode="cover" />
      </View>

      <View style={styles.bgActions}>
        <HypeIcon size={13} color={palette.hype} fill={palette.hype} />
        <Text style={styles.bgHypes}>{post.hypes}</Text>
        <CommentIcon size={12} color={palette.muted} />
        <ShareIcon size={11} color={palette.muted} />
      </View>
    </View>
  );
}

/** The hero post. */
function MockPostCard() {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.cardAvatar}>
          <Image source={maya} style={styles.fill} resizeMode="cover" />
        </View>
        <View style={styles.cardMeta}>
          <Text style={styles.cardName}>maya</Text>
          <Text style={styles.cardTime}>2m ago</Text>
        </View>
      </View>

      <View style={styles.cardImage}>
        {/* The web's placeholder behind the photograph, visible only until
            it loads: linear-gradient(135deg, #6d28d9, #2563eb) */}
        <Gradient
          x2={1}
          y2={1}
          stops={[
            { offset: 0, color: "#6d28d9", opacity: 1 },
            { offset: 1, color: "#2563eb", opacity: 1 },
          ]}
        />
        <Image source={postSample} style={styles.fill} resizeMode="cover" />
      </View>

      <View style={styles.cardActions}>
        <View style={styles.cardHype}>
          <HypeIcon size={24} color={palette.hype} fill={palette.hype} />
          <Text style={styles.cardHypes}>2.4k</Text>
        </View>
        <CommentIcon size={23} color={palette.muted} />
        <ShareIcon size={22} color={palette.muted} />
      </View>
    </View>
  );
}

/**
 * A CSS gradient, as SVG.
 *
 * It fills its parent, so the parent's size is the gradient's size and no
 * dimension is restated here. Each stop carries its own opacity because SVG
 * has no `transparent` keyword stop that interpolates the way CSS's does.
 */
function Gradient({
  x2,
  y2,
  stops,
}: {
  x2: number;
  y2: number;
  stops: ReadonlyArray<{ offset: number; color: string; opacity: number }>;
}) {
  const id = `g${x2}${y2}${stops.length}${stops[0].color.slice(1)}`;
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2={String(x2)} y2={String(y2)}>
          {stops.map((s) => (
            <Stop
              key={s.offset}
              offset={String(s.offset)}
              stopColor={s.color}
              stopOpacity={String(s.opacity)}
            />
          ))}
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

/**
 * The web's `animate-float-y` with a per-instance duration and delay.
 *
 * One cycle is up and back, so each leg is half the duration; the delay runs
 * once before the loop rather than before every cycle, which is what CSS's
 * animation-delay does and what `Animated.loop` wrapping the delay would
 * get wrong.
 */
function Float({ dur, delay, children }: { dur: number; delay: number; children: ReactNode }) {
  const [v] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const leg = dur / 2;
    const run = Animated.sequence([
      Animated.delay(delay),
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, {
            toValue: 1,
            duration: leg,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: 0,
            duration: leg,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ),
    ]);
    run.start();
    return () => run.stop();
  }, [v, dur, delay]);

  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [0, FLOAT_Y] });
  return <Animated.View style={{ transform: [{ translateY }] }}>{children}</Animated.View>;
}

/**
 * The web's `revealStyle` — a fade and a 16px rise, staggered by order.
 *
 * Two Animated values rather than one, because the web gives opacity and
 * transform different durations and different curves (0.5s ease against
 * 0.55s cubic-bezier(0.16,1,0.3,1)), and one value cannot carry both.
 */
function Reveal({
  active,
  order,
  children,
}: {
  active: boolean;
  order: number;
  children: ReactNode;
}) {
  const [fade] = useState(() => new Animated.Value(active ? 1 : 0));
  const [rise] = useState(() => new Animated.Value(active ? 0 : 1));

  useEffect(() => {
    const delay = active ? order * REVEAL_GAP : 0;
    Animated.parallel([
      Animated.timing(fade, {
        toValue: active ? 1 : 0,
        duration: 500, // opacity 0.5s
        delay,
        easing: Easing.inOut(Easing.ease), // `ease`
        useNativeDriver: true,
      }),
      Animated.timing(rise, {
        toValue: active ? 0 : 1,
        duration: 550, // transform 0.55s
        delay,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
        useNativeDriver: true,
      }),
    ]).start();
  }, [active, order, fade, rise]);

  const translateY = rise.interpolate({ inputRange: [0, 1], outputRange: [0, 16] });
  return (
    <Animated.View style={{ opacity: fade, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // -left-28 -top-8 w-40 opacity-60
  leo: { position: "absolute", left: -112, top: -32, width: 160, opacity: 0.6 },
  // -left-28 -bottom-6 w-40 opacity-50
  jay: { position: "absolute", left: -112, bottom: -24, width: 160, opacity: 0.5 },
  // -right-24 top-3 w-36 opacity-60
  nia: { position: "absolute", right: -96, top: 12, width: 144, opacity: 0.6 },
  // z-20, translate(-12px, -10px)
  hero: { zIndex: 20, transform: [{ translateX: -12 }, { translateY: -10 }] },
  // -right-32 -bottom-5 z-30 w-48
  ada: { position: "absolute", right: -128, bottom: -20, zIndex: 30, width: 192 },
  // -left-32 -right-32 -bottom-10 z-40 h-44
  fade: { position: "absolute", left: -128, right: -128, bottom: -40, zIndex: 40, height: 176 },

  bgCard: {
    borderRadius: 20, // rounded-[20px]
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 10, // p-2.5
    // shadow-xl, as one shadow rather than four.
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  bgHead: { flexDirection: "row", alignItems: "center", gap: 8 }, // gap-2
  bgAvatar: {
    width: BG_AVATAR,
    height: BG_AVATAR,
    borderRadius: BG_AVATAR * 0.3, // rounded-[30%]
    overflow: "hidden",
  },
  bgMeta: { flex: 1, minWidth: 0 },
  bgName: {
    color: palette.foreground,
    fontFamily: family.bold,
    fontSize: 11, // text-[11px]
    lineHeight: 12.1, // leading-tight
  },
  bgTime: {
    color: palette.muted,
    fontFamily: family.normal,
    fontSize: 9, // text-[9px]
  },
  bgImage: {
    marginTop: 8, // mt-2
    width: "100%",
    aspectRatio: 1, // aspect-square
    borderRadius: 12, // rounded-xl
    backgroundColor: palette.elevated,
    overflow: "hidden",
  },
  bgActions: {
    marginTop: 8, // mt-2
    flexDirection: "row",
    alignItems: "center",
    gap: 8, // gap-2
  },
  bgHypes: {
    color: palette.foreground,
    fontFamily: family.bold,
    fontSize: type.tiny, // text-[10px]
  },

  card: {
    width: CARD_W,
    borderRadius: 28, // rounded-[28px]
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 16, // p-4
    // shadow-2xl
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 14 },
    elevation: 20,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 12 }, // gap-3
  cardAvatar: {
    width: CARD_AVATAR,
    height: CARD_AVATAR,
    borderRadius: CARD_AVATAR * 0.3, // rounded-[30%]
    overflow: "hidden",
  },
  cardMeta: { flex: 1 },
  cardName: {
    color: palette.foreground,
    fontFamily: family.bold,
    fontSize: 15, // text-[15px]
    lineHeight: 16.5, // leading-tight
  },
  cardTime: {
    color: palette.muted,
    fontFamily: family.normal,
    fontSize: type.xs, // text-xs
  },
  cardImage: {
    marginTop: 14, // mt-3.5
    width: "100%",
    aspectRatio: 1, // aspect-square
    borderRadius: 24, // rounded-3xl
    overflow: "hidden",
  },
  cardActions: {
    marginTop: 14, // mt-3.5
    flexDirection: "row",
    alignItems: "center",
    gap: 20, // gap-5
  },
  cardHype: { flexDirection: "row", alignItems: "center", gap: 6 }, // gap-1.5
  cardHypes: {
    color: palette.foreground,
    fontFamily: family.bold,
    fontSize: 15, // text-[15px]
  },

  fill: { width: "100%", height: "100%" },
});
