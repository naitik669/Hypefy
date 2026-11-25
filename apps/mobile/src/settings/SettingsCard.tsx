import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight, type LucideIcon } from "lucide-react-native";
import { palette, type, family, radius } from "@/theme";

/**
 * A titled group of settings rows, and one row — the website's
 * src/components/settings/SettingsCard.tsx, drawn natively.
 *
 * Same anatomy: an uppercase faint title above a bordered elevated card,
 * hairline rules BETWEEN rows (never against the card's own edge), a
 * squircle glyph, label over sub, and a chevron. `tone="warn"` tints the
 * glyph, as the web does for rows that lead somewhere consequential.
 */
export function SettingsCard({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <View>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <View style={styles.card}>{children}</View>
    </View>
  );
}

export function SettingsRow({
  label,
  sub,
  icon: Icon,
  onPress,
  tone = "default",
  first = false,
}: {
  label: string;
  sub?: string;
  icon: LucideIcon;
  onPress: () => void;
  tone?: "default" | "warn";
  /** The first row draws no rule above itself. */
  first?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !first && styles.rule, pressed && styles.pressed]}
    >
      <View style={[styles.glyph, tone === "warn" && styles.glyphWarn]}>
        <Icon size={18} color={tone === "warn" ? palette.danger : palette.foreground} />
      </View>
      <View style={styles.text}>
        <Text style={styles.label}>{label}</Text>
        {sub ? (
          <Text style={styles.sub} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      <ChevronRight size={17} color={palette.faint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: {
    marginBottom: 8,
    paddingHorizontal: 4,
    color: palette.faint,
    fontFamily: family.bold,
    fontSize: type.xs,
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },
  card: {
    overflow: "hidden",
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.elevated,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
    minHeight: 44,
  },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border },
  pressed: { backgroundColor: "rgba(255,255,255,0.05)" },
  glyph: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
  },
  glyphWarn: { backgroundColor: "rgba(255,69,69,0.15)" },
  text: { flex: 1, minWidth: 0 },
  label: { color: palette.foreground, fontFamily: family.semibold, fontSize: type.sm },
  sub: { color: palette.muted, fontFamily: family.normal, fontSize: type.xs, marginTop: 2 },
});
