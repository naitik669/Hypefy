import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/supabase";
import { SettingsHeader } from "@/settings/Header";
import { DeleteAccount } from "@/settings/DeleteAccount";
import { SignOutRow } from "@/auth/SignOutRow";
import { base, palette } from "@/theme";

/**
 * Settings → Account — the website's /settings/account, in the order the
 * website stacks it: sign-out, then the Danger zone at the bottom.
 *
 * What the web page has above those and this does not: changing the email
 * and the password, Spotify, and the data download. Those screens are not
 * ported; the deletion that Google Play requires inside the app is.
 *
 * The username is read here because it is the word typed to arm deletion.
 * Without one the word is "delete", exactly as on the web.
 */
export default function AccountSettings() {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "ready"; username: string | null } | { kind: "failed"; message: string }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) {
          if (!cancelled) router.replace("/");
          return;
        }
        const { data: row, error: readError } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", data.user.id)
          .maybeSingle();
        if (readError) throw readError;
        const username = (row as { username?: string | null } | null)?.username ?? null;
        if (!cancelled) setState({ kind: "ready", username });
      } catch (e) {
        if (!cancelled) {
          setState({
            kind: "failed",
            message: e instanceof Error ? e.message : "Could not load your account.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <KeyboardAvoidingView
      style={base.screen}
      // Android resizes the window for the keyboard on its own; iOS needs
      // the padding, or the password field sits under the keyboard.
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <SettingsHeader title="Account" />
      {state.kind === "loading" ? (
        <View style={base.centre}>
          <ActivityIndicator color={palette.accent} />
        </View>
      ) : state.kind === "failed" ? (
        <View style={base.centre}>
          <Text style={base.title}>Could not load your account</Text>
          <Text style={[base.body, styles.gap]}>{state.message}</Text>
          <SignOutRow />
        </View>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]}
        >
          <SignOutRow />
          <DeleteAccount username={state.username} />
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingTop: 16, gap: 24 },
  gap: { marginTop: 10 },
});
