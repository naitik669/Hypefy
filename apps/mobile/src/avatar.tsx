import { StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { palette, family } from "@/theme";
import { avatarStops, STOP_MID } from "./avatar-color";

/**
 * The gradient-and-initial avatar, for a user with no picture.
 *
 * The web's `Avatar` (src/components/ui/Avatar.tsx) draws a squircle filled
 * with a three-stop gradient that turns the hue rather than draining the
 * lightness (see avatar-color.ts) and puts the name's first letter over it
 * at 40% of the box. There is no gradient
 * primitive in React Native, and expo-linear-gradient is a native module —
 * adding one would cost a full cloud build and break over-the-air delivery
 * for a decoration. react-native-svg is already linked (the icons use it),
 * so the fill is an SVG gradient instead. Same three stops.
 *
 * The radius is 30% of the box, as `rounded-[30%]` is, rather than a fixed
 * number — a 26 avatar and a 42 avatar are the same shape on the web and
 * have to be the same shape here.
 *
 * The colour arithmetic lives in avatar-color.ts, where a Node test can
 * call it; see that file for why.
 */
export function Avatar({
  name,
  hue = 200,
  size = 40,
}: {
  name: string;
  hue?: number;
  size?: number;
}) {
  const initial = name?.trim()?.[0]?.toUpperCase() ?? "?";
  const [from, mid, to] = avatarStops(hue);
  const id = `av${hue}`;
  return (
    <View
      style={[
        styles.box,
        // rounded-[30%]
        { width: size, height: size, borderRadius: size * 0.3 },
      ]}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          {/* 145deg in CSS runs corner to corner on a square; these are the
              corners the browser interpolates between, and the middle stop
              sits where the web puts it. */}
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={from} />
            <Stop offset={String(STOP_MID.at)} stopColor={mid} />
            <Stop offset="1" stopColor={to} />
          </LinearGradient>
        </Defs>
        <Rect width={size} height={size} fill={`url(#${id})`} />
      </Svg>
      <Text style={[styles.initial, { fontSize: size * 0.4 }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: palette.elevated,
  },
  // text-white/95
  // The gradient no longer falls to a dark end, so the letter has less to
  // sit against: the shadow is what carries it, as on the web.
  initial: {
    color: "#ffffff",
    fontFamily: family.bold,
    textShadowColor: "rgba(0, 0, 0, 0.38)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
