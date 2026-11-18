import { Text, View, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { layout } from "@hypefy/tokens";
import { palette, type, family } from "@/theme";
import { DestinationIcon } from "@/icons";

/**
 * The top bar, ported from the web's structure rather than its code.
 *
 * It exists to close a reachability gap the tabs layout created. Discover
 * is `bottomBar: false` in core, so it has a route and no way to reach it;
 * on the web the compass in this bar is one of the two ways in, and the
 * other is a swipe right from the feed. The swipe is a later job, so until
 * then this is the only way to Discover on the phone.
 *
 * Three slots with equal flanks, which is the web's arrangement and the
 * reason for it: the centre is a switcher, and it reads as crooked the
 * moment one side is wider than the other. The web keeps a fixed-width
 * empty span on the right for signed-out visitors for exactly this, and
 * the same trick holds the centre here.
 *
 * What is deliberately NOT here yet:
 *
 *  - The notification bell. /notifications is not in core's DESTINATIONS,
 *    and a bell that navigates nowhere is worse than no bell. The slot is
 *    reserved at the width the bell will take, so adding it later moves
 *    nothing else.
 *  - The feed switcher. It needs feed tabs, which need a feed. The
 *    wordmark stands in the centre until then — not as a placeholder
 *    pretending to be a control, but as the thing that is actually true
 *    about this screen today.
 */

/** Matches the web's `w-20` flanks: wide enough for a 40pt target plus air. */
const FLANK = 80;

export function TopBar() {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.bar,
        { height: layout.topBarHeight + insets.top, paddingTop: insets.top },
      ]}
    >
      <View style={styles.flank}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Discover"
          hitSlop={8}
          style={styles.action}
          onPress={() => router.push("/discover")}
        >
          <DestinationIcon href="/discover" focused={false} color={palette.foreground} size={22} />
        </Pressable>
      </View>

      <Text style={styles.mark} accessibilityRole="header">
        Hypefy<Text style={styles.markDot}>.</Text>
      </Text>

      {/* The bell's seat. Empty, and the same width as the left flank so
          the wordmark sits on the centre line rather than near it. */}
      <View style={[styles.flank, styles.flankEnd]} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    backgroundColor: palette.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  flank: {
    width: FLANK,
    flexDirection: "row",
    alignItems: "center",
  },
  flankEnd: { justifyContent: "flex-end" },
  action: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  mark: {
    color: palette.foreground,
    fontFamily: family.extrabold,
    fontSize: type.lg,
    letterSpacing: -0.6,
  },
  markDot: { color: palette.accent },
});
