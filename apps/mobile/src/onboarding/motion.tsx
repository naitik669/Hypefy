import { useEffect, useState, type ReactNode } from "react";
import { Animated, Easing, StyleSheet } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

/**
 * The onboarding slides' shared motion, ported from the web's IntroCarousel.
 *
 * The web declares `Float`, `revealStyle` and `reelReveal` once and the five
 * visuals share them, so they live in one file here too — a second copy is
 * how two slides end up bobbing at different speeds for no reason.
 *
 * `Gradient` is here for the same reason: two slides need a CSS gradient and
 * React Native has none, so both draw it with react-native-svg, which is
 * already linked for the icons.
 *
 * One thing the web does that none of this does: blur. The web's reveals
 * fade a slide IN from `blur(8px)` or `blur(10px)`. React Native has no
 * filter, and the only way to get one is expo-blur, a native module — which
 * would cost a full cloud build and stop over-the-air delivery until the new
 * binary was installed. So the reveals are a fade, a rise and (on the reels)
 * a scale, and the blur is absent rather than approximated.
 */

/** 170ms a step — the web's REVEAL_GAP, and reelReveal's own `order * 170`. */
export const REVEAL_GAP = 170;

/** The bob's travel: the `float-y` keyframe goes to -7px and back. */
export const FLOAT_Y = -7;

/**
 * The web's `animate-float-y` with a per-instance duration and delay.
 *
 * One cycle is up and back, so each leg is half the duration; the delay runs
 * once before the loop rather than before every cycle, which is what CSS's
 * animation-delay does and what `Animated.loop` wrapping the delay would
 * get wrong.
 */
export function Float({
  dur,
  delay,
  children,
}: {
  dur: number;
  delay: number;
  children: ReactNode;
}) {
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
export function Reveal({
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

/**
 * The web's `reelReveal` — the same idea as `Reveal` with longer timings, a
 * 22px rise and a scale from 0.95.
 *
 * It is a separate component rather than a parameterised `Reveal` because
 * the web keeps them separate, and because sharing one would mean five
 * props carrying numbers that only ever take two combinations.
 */
export function ReelReveal({
  active,
  order,
  children,
}: {
  active: boolean;
  order: number;
  children: ReactNode;
}) {
  const [fade] = useState(() => new Animated.Value(active ? 1 : 0));
  const [enter] = useState(() => new Animated.Value(active ? 0 : 1));

  useEffect(() => {
    const delay = active ? order * REVEAL_GAP : 0;
    Animated.parallel([
      Animated.timing(fade, {
        toValue: active ? 1 : 0,
        duration: 550, // opacity 0.55s
        delay,
        easing: Easing.inOut(Easing.ease), // `ease`
        useNativeDriver: true,
      }),
      Animated.timing(enter, {
        toValue: active ? 0 : 1,
        duration: 600, // transform 0.6s
        delay,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
        useNativeDriver: true,
      }),
    ]).start();
  }, [active, order, fade, enter]);

  // translateY(22px) scale(0.95) at rest, both back to nothing when active.
  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [0, 22] });
  const scale = enter.interpolate({ inputRange: [0, 1], outputRange: [1, 0.95] });
  return (
    <Animated.View style={{ opacity: fade, transform: [{ translateY }, { scale }] }}>
      {children}
    </Animated.View>
  );
}

/**
 * The web's `animate-star-pop` — a 2.4s scale-and-tilt, forever.
 *
 * Only the hero reel's star does this, and only while its slide is the one
 * on screen, which is what the web's `active ? "animate-star-pop" : ""`
 * says.
 */
export function StarPop({ active, children }: { active: boolean; children: ReactNode }) {
  const [v] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!active) {
      v.setValue(0);
      return;
    }
    const leg = 1200; // 2.4s there and back
    const run = Animated.loop(
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
    );
    run.start();
    return () => run.stop();
  }, [v, active]);

  // scale(1.2) rotate(10deg) at the top of the arc.
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] });
  const rotate = v.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "10deg"] });
  return <Animated.View style={{ transform: [{ scale }, { rotate }] }}>{children}</Animated.View>;
}

/**
 * A CSS gradient, as SVG.
 *
 * It fills its parent, so the parent's size is the gradient's size and no
 * dimension is restated here. Each stop carries its own opacity because SVG
 * has no `transparent` keyword stop that interpolates the way CSS's does.
 */
export function Gradient({
  x2,
  y2,
  stops,
}: {
  x2: number;
  y2: number;
  stops: ReadonlyArray<{ offset: number; color: string; opacity: number }>;
}) {
  const id = `g${x2}${y2}${stops.length}${stops[0].color.slice(1)}${stops[0].opacity}`;
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
