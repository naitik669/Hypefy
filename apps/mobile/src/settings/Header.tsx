import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { palette, type, family } from "@/theme";

/**
 * The web's `<PageHeader title=… showBack />`, for the settings screens: a
 * back control as well as the system gesture, and the title beside it.
 */
export function SettingsHeader({ title }: { title: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={10}
        onPress={() => router.back()}
        style={styles.action}
      >
        <ArrowLeft size={22} color={palette.foreground} />
      </Pressable>
      <Text style={styles.heading} accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  action: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  heading: { flex: 1, color: palette.foreground, fontFamily: family.bold, fontSize: type.base },
});
