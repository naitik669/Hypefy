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
}: {
  href: string;
  label: string;
  blurb: string;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[base.screen, { paddingTop: insets.top }]}>
      <View style={[base.centre, { paddingBottom: navSpace(insets.bottom) }]}>
        <View style={styles.badge}>
          <DestinationIcon href={href} focused={false} color={palette.faint} size={26} />
        </View>
        <Text style={base.title}>{label}</Text>
        <Text style={[base.body, styles.blurb]}>{blurb}</Text>
        <Text style={styles.phase}>Phase 6</Text>
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
