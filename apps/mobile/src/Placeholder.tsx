import { Text, View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { navSpace } from "@hypefy/tokens";
import { base, palette, type, family } from "@/theme";
import { DestinationIcon } from "@/icons";

/**
 * What a destination shows before its screen exists.
 *
 * It says what it is and what is coming, and it does NOT show invented
 * posts, fake avatars or a shimmer pretending to load. A placeholder that
 * imitates the real thing makes the shell look finished, and then every
 * screenshot and every demo has to be qualified out loud. This one is
 * honest at a glance.
 *
 * It also earns its place as a test: it reserves `navSpace(bottom inset)`
 * below itself, which is the figure the web's scroll containers leave for
 * the same bar. If the tab bar and this disagree, content sits under the
 * bar — and that is visible here, on the first build, rather than later
 * under a feed where it reads as a scrolling bug.
 */
export function Placeholder({
  href,
  label,
  blurb,
  ownsTopInset = false,
  footer,
}: {
  href: string;
  label: string;
  blurb: string;
  /**
   * Anything this destination can actually DO while its screen is a
   * placeholder.
   *
   * Profile uses it for sign-out, which the app had no path to at all
   * until a signed-in device proved it. A placeholder being honest about
   * being unfinished is right; being a dead end that traps someone in a
   * session is not.
   */
  footer?: React.ReactNode;
  /**
   * True on a screen with no header of its own to pad for the notch.
   *
   * Every tab but Shots gets TopBar, and the navigator starts the scene
   * BELOW it — so adding the top inset here too would inset twice and
   * leave a band of dead space. Shots is full-bleed and has no header, so
   * it is the one screen that has to pad for itself.
   *
   * A boolean rather than reading the header height, because the thing
   * that varies is which screen owns the chrome, and that is a fact about
   * the screen rather than a measurement.
   */
  ownsTopInset?: boolean;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[base.screen, ownsTopInset ? { paddingTop: insets.top } : null]}>
      <View style={[base.centre, { paddingBottom: navSpace(insets.bottom) }]}>
        <View style={styles.badge}>
          <DestinationIcon href={href} focused={false} color={palette.faint} size={26} />
        </View>
        <Text style={base.title}>{label}</Text>
        <Text style={[base.body, styles.blurb]}>{blurb}</Text>
        <Text style={styles.phase}>Phase 6</Text>
        {footer}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  blurb: { marginTop: 10, maxWidth: 300 },
  phase: {
    marginTop: 20,
    color: palette.faint,
    fontFamily: family.medium,
    fontSize: type.tiny,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
});
