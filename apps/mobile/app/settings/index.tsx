import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Shield } from "lucide-react-native";
import { SettingsHeader } from "@/settings/Header";
import { SettingsCard, SettingsRow } from "@/settings/SettingsCard";
import { LEGAL_LINKS } from "@/settings/links";
import { SignOutRow } from "@/auth/SignOutRow";
import { siteOrigin } from "@/site";
import { base, palette, type, family } from "@/theme";

/**
 * Settings — the website's /settings hub, with the rows this app can open.
 *
 * Same order and the same anatomy: titled cards of rows, sign-out beneath
 * them, the legal footer last. Account is the row that matters for the
 * store: /delete-account tells a reviewer "open your profile, then
 * Settings, choose Account, at the bottom choose Delete account", and that
 * is exactly the path through this app.
 *
 * The web hub's other rows (Edit profile, Your style, Marketplace,
 * Security, Privacy, Notifications, Topics, Creator tools, the lists, the
 * invite row, Help) lead to screens this app does not have yet. They are
 * left off rather than drawn as rows that go nowhere — that is the
 * notifications screen's rule, and the Placeholder's: an honest absence over
 * a row that looks tappable and does nothing. Each comes back as its screen
 * is ported. That is a porting gap, not a platform reason, and is recorded
 * as one.
 */
export default function Settings() {
  const insets = useSafeAreaInsets();
  const site = siteOrigin();

  return (
    <View style={base.screen}>
      <SettingsHeader title="Settings" />
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]}
      >
        <SettingsCard title="General">
          <SettingsRow
            first
            label="Account"
            sub="Sign out, delete your account"
            icon={Shield}
            onPress={() => router.push("/settings/account")}
          />
        </SettingsCard>

        <SignOutRow />

        <View style={styles.legal}>
          {LEGAL_LINKS.map((link) => (
            <Pressable
              key={link.path}
              accessibilityRole="link"
              accessibilityLabel={link.label}
              hitSlop={6}
              onPress={() => void Linking.openURL(`${site}${link.path}`)}
            >
              <Text style={styles.legalText}>{link.label}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 8, gap: 24 },
  legal: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    columnGap: 16,
    rowGap: 8,
  },
  legalText: {
    color: palette.faint,
    fontFamily: family.normal,
    fontSize: 11,
    textDecorationLine: "underline",
  },
});
