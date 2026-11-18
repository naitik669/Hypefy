import { useCallback, useMemo, useState } from "react";
import {
  Animated,
  Easing,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowRight } from "lucide-react-native";
import { palette, type, family, radius } from "@/theme";
import { SLIDES, COPY, type SlideId } from "@/onboarding/slides";
import { WelcomeVisual } from "@/onboarding/WelcomeVisual";
import { MockPostStack } from "@/onboarding/MockPostStack";

/**
 * The onboarding carousel, ported from the web's IntroCarousel.
 *
 * Every measurement here is the web's, converted from its Tailwind class to
 * the number that class means — px-7 is 28, h-14 is 56, text-[2rem] is 32.
 * Nothing is eyeballed. Where the web names a token (accent, muted, border,
 * accent-ink) this names the same one from @hypefy/tokens, so a palette
 * change moves both.
 *
 * Two differences from the web, both forced rather than chosen:
 *
 *  - No blur on the outgoing slide. The web fades and blurs it with a CSS
 *    filter; React Native has no filter without a native blur view, and the
 *    outgoing slide is off-screen behind `overflow: hidden` anyway, so what
 *    the blur contributes is a few frames at the edge of a swipe.
 *  - Swipe is a PanResponder rather than pointer events, with the web's own
 *    45px threshold and its one-slide-per-gesture rule. There is no wheel
 *    handler, because there is no wheel.
 *
 * The visuals are the other 600 lines of the web component and land one
 * slide at a time. The phone mock-up and the post wall are in; the reels,
 * the discover bubbles and the profile card are not. Until they are, the
 * area they occupy is reserved at the size they will take and left visibly
 * empty, rather than filled with something that would have to be removed.
 */

/** cubic-bezier(0.16, 1, 0.3, 1) — the web's slide easing, verbatim. */
const EASE_OUT_EXPO = Easing.bezier(0.16, 1, 0.3, 1);

/** Tailwind values the web uses, as the numbers they stand for. */
const PAGE_X = 28; // px-7 on each slide
const BAR_X = 24; // px-6 on the top bar
const SWIPE_THRESHOLD = 45; // the web's dx cutoff

export function IntroCarousel({ onFinish }: { onFinish?: () => void }) {
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const [width, setWidth] = useState(0);
  /*
   * Lazy useState, not `useRef(new Animated.Value(0)).current`.
   *
   * The ref form is the pattern most React Native examples use, and
   * react-hooks/refs rejects it: reading `.current` during render is the
   * thing the rule exists to stop, and the lint ratchet would not let it
   * through. The initialiser runs once either way, so the value is just
   * as stable — and this form says so to the compiler rather than to a
   * reader.
   */
  const [track] = useState(() => new Animated.Value(0));

  const isLast = index === SLIDES.length - 1;

  /*
   * No refs anywhere in here, which took three attempts to get right.
   *
   * The familiar React Native shape — a ref for the current index, another
   * for the measured width, one PanResponder built once — is rejected by
   * react-hooks/refs, and correctly: a lazy `useState` initialiser and a
   * `useMemo` body both run during render, so a ref read reached from
   * either is a render-phase read however indirect it looks. The rule even
   * traced it through `goTo` into the responder, which is why moving the
   * responder to useMemo alone did not settle it.
   *
   * State does the same job here. `width` is already state because the
   * track's width is rendered from it, and `index` already drives what is
   * on screen, so neither ref was carrying information the component did
   * not have — only saving a re-render that costs nothing at five slides.
   */
  const goTo = useCallback(
    (i: number) => {
      const next = Math.max(0, Math.min(SLIDES.length - 1, i));
      setIndex(next);
      Animated.timing(track, {
        toValue: -next * width,
        duration: 550,
        easing: EASE_OUT_EXPO,
        useNativeDriver: true,
      }).start();
    },
    [track, width],
  );

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const w = e.nativeEvent.layout.width;
      setWidth(w);
      // Keep the current slide under the viewport when the width changes —
      // a rotation or a split-screen resize otherwise leaves the track
      // parked at a stale offset.
      track.setValue(-index * w);
    },
    [track, index],
  );

  /*
   * One slide per gesture, no momentum skipping — the rule the web's
   * pointer handler enforces, and the reason it compares total dx rather
   * than velocity.
   */
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderRelease: (_e, g) => {
          if (g.dx <= -SWIPE_THRESHOLD) goTo(index + 1);
          else if (g.dx >= SWIPE_THRESHOLD) goTo(index - 1);
        },
      }),
    // Rebuilt per slide so the handler closes over the CURRENT index.
    // The alternative — one responder reading a ref — is what the first
    // version did, and react-hooks/refs is right to reject it: a lazy
    // useState initialiser runs during render, so the ref read is a
    // render-phase read however it looks. Five recreations across five
    // slides costs nothing.
    [index, goTo],
  );

  const advance = () => {
    if (isLast) onFinish?.();
    else goTo(index + 1);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Top bar — wordmark + Skip */}
      <View style={styles.topBar}>
        <Text style={styles.wordmark}>
          Hypefy<Text style={styles.wordmarkDot}>.</Text>
        </Text>
        {!isLast && (
          <Pressable accessibilityRole="button" hitSlop={10} onPress={() => onFinish?.()}>
            <Text style={styles.subtle}>Skip</Text>
          </Pressable>
        )}
      </View>

      {/* Pager */}
      <View style={styles.pager} onLayout={onLayout} {...pan.panHandlers}>
        <Animated.View
          style={[
            styles.track,
            { width: width * SLIDES.length, transform: [{ translateX: track }] },
          ]}
        >
          {SLIDES.map((slide, i) => (
            <Slide key={slide} slide={slide} active={i === index} width={width} />
          ))}
        </Animated.View>
      </View>

      {/* Footer — dots + CTA */}
      <View style={[styles.footer, { paddingBottom: 40 + insets.bottom }]}>
        <View style={styles.dots}>
          {SLIDES.map((slide, i) => (
            <Pressable
              key={slide}
              accessibilityRole="button"
              accessibilityLabel={`Go to slide ${i + 1}`}
              accessibilityState={{ selected: i === index }}
              hitSlop={10}
              onPress={() => goTo(i)}
              style={[styles.dot, i === index ? styles.dotActive : styles.dotIdle]}
            />
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={advance}
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
        >
          <Text style={styles.ctaText}>{isLast ? "Get Hyped" : "Next"}</Text>
          <ArrowRight size={20} strokeWidth={2.6} color={palette.accentInk} />
        </Pressable>

        {isLast && (
          <Pressable accessibilityRole="button" onPress={() => onFinish?.()} style={styles.link}>
            <Text style={styles.subtleCentre}>
              Already have an account? <Text style={styles.linkStrong}>Sign in</Text>
            </Text>
          </Pressable>
        )}

        {/* The way out that is not a form. The web's comment is worth
            keeping: without it the front door leads only to sign-up. */}
        <Pressable accessibilityRole="button" onPress={() => onFinish?.()} style={styles.link}>
          <Text style={styles.subtleCentre}>
            Or <Text style={styles.linkStrong}>look around first</Text>
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function Slide({ slide, active, width }: { slide: SlideId; active: boolean; width: number }) {
  return (
    <View style={[styles.slide, { width }]}>
      {/*
       * The visual's seat: `min-h-0 flex-1` on the web, so it takes every
       * row the copy and footer do not. Welcome and posts are drawn; the
       * other three mock-ups land next, and their slides stay empty until
       * they do rather than borrowing a stand-in that has to come back out.
       */}
      <View style={styles.visualSlot}>
        {slide === "welcome" ? (
          <WelcomeVisual />
        ) : slide === "posts" ? (
          <MockPostStack active={active} />
        ) : null}
      </View>
      <View style={styles.copySlot}>
        <Copy slide={slide} active={active} />
      </View>
    </View>
  );
}

function Copy({ slide, active }: { slide: SlideId; active: boolean }) {
  const data = COPY[slide];
  return (
    <View style={!active && styles.inactive}>
      <Text style={styles.title}>
        {data.titleLead}
        {data.titleAccent ? <Text style={styles.titleAccent}>{data.titleAccent}</Text> : null}
      </Text>
      <Text style={styles.lead}>{data.lead}</Text>
      <Text style={styles.body}>{data.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: BAR_X,
    paddingTop: 20, // pt-5
  },
  wordmark: {
    color: palette.foreground,
    fontFamily: family.extrabold,
    fontSize: type.lg, // text-lg
    letterSpacing: -0.45, // tracking-tight at 18px
  },
  wordmarkDot: { color: palette.accent },

  pager: { flex: 1, overflow: "hidden" },
  track: { flex: 1, flexDirection: "row" },
  slide: { flex: 1, paddingHorizontal: PAGE_X },
  // flex-1 min-h-0 flex items-center justify-center — the web's seat for
  // the mock-up, centred in whatever room the copy and footer leave.
  visualSlot: { flex: 1, minHeight: 0, alignItems: "center", justifyContent: "center" },
  copySlot: { paddingTop: 16, paddingBottom: 20 }, // pt-4 pb-5
  // The web fades and blurs an inactive slide; without a filter this is the
  // fade alone. Off-screen either way.
  inactive: { opacity: 0 },

  title: {
    color: palette.foreground,
    fontFamily: family.extrabold,
    fontSize: 32, // text-[2rem]
    lineHeight: 35.2, // leading-[1.1]
    letterSpacing: -0.8, // tracking-tight at 32px
  },
  titleAccent: { color: palette.accent },
  lead: {
    marginTop: 8, // mt-2
    color: palette.foreground,
    fontFamily: family.semibold,
    fontSize: type.base,
  },
  body: {
    marginTop: 8,
    maxWidth: 300, // max-w-[300px]
    color: palette.muted,
    fontFamily: family.normal,
    fontSize: type.sm,
    lineHeight: 22.75, // leading-relaxed on 14px
  },

  footer: { paddingHorizontal: PAGE_X, paddingTop: 8 }, // pt-2
  dots: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8, // gap-2
    marginBottom: 20, // mb-5
  },
  dot: { height: 8, borderRadius: 4 },
  dotActive: { width: 24, backgroundColor: palette.accent },
  dotIdle: { width: 8, backgroundColor: palette.border },

  cta: {
    height: 56, // h-14
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: radius.card, // rounded-2xl
    backgroundColor: palette.accent,
  },
  ctaPressed: { transform: [{ scale: 0.96 }] }, // active:scale-[0.96]
  ctaText: {
    color: palette.accentInk,
    fontFamily: family.bold,
    fontSize: type.base,
  },

  link: { marginTop: 12, minHeight: 24, justifyContent: "center" }, // mt-3
  subtle: { color: palette.muted, fontFamily: family.medium, fontSize: type.sm },
  subtleCentre: {
    color: palette.muted,
    fontFamily: family.medium,
    fontSize: type.sm,
    textAlign: "center",
  },
  linkStrong: { color: palette.foreground, fontFamily: family.semibold },
});
