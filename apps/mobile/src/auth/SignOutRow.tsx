import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { supabase } from "@/supabase";
import { palette, type, family, radius } from "@/theme";

/**
 * The way back out, and the reason it exists at all.
 *
 * Replacing the Phase 5 diagnostic screen removed the only sign-out in the
 * app, and nothing noticed: the entry router sends a signed-in person
 * straight to the feed, so anyone who already had a session could no
 * longer reach the sign-in or sign-up screens that had just been built.
 * Naitik hit exactly that — "I can't see Google sign-in or the date of
 * birth" — and was right, because from a signed-in app there was no path
 * to them. Every test passed, because no test asked whether a signed-in
 * person could get out.
 *
 * On the web this lives in Settings, which is not ported. It sits on the
 * Profile tab until Settings is, which is the nearest real place and is
 * where someone would look for it.
 *
 * Two deliberate choices:
 *
 *  - It asks first. Signing out of a phone means typing a password back
 *    in, and a mis-tap on a tab screen should not cost that.
 *  - It navigates to /onboarding rather than relying on the entry router.
 *    `signOut` clears the store; whether a layout re-reads it is a timing
 *    question, and this is the one action whose whole purpose is to leave.
 */
export function SignOutRow() {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signOut = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.signOut();
      if (err) {
        setError(err.message);
        return;
      }
      router.replace("/onboarding");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign out.");
    } finally {
      setBusy(false);
    }
  }, []);

  if (!asking) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        onPress={() => setAsking(true)}
        style={styles.link}
      >
        <Text style={styles.linkText}>Sign out</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.confirm}>
      <Text style={styles.ask}>Sign out of Hypefy?</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          disabled={busy}
          onPress={() => setAsking(false)}
          style={styles.cancel}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Confirm sign out"
          accessibilityState={{ busy }}
          disabled={busy}
          onPress={() => void signOut()}
          style={styles.danger}
        >
          {busy ? (
            <ActivityIndicator color={palette.foreground} />
          ) : (
            <Text style={styles.dangerText}>Sign out</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  link: {
    marginTop: 20,
    paddingHorizontal: 22,
    minHeight: 44, // a real target even though it reads as a text link
    justifyContent: "center",
  },
  linkText: {
    color: palette.muted,
    fontFamily: family.medium,
    fontSize: type.sm,
    textAlign: "center",
  },

  confirm: { marginTop: 20, alignItems: "center" },
  ask: {
    color: palette.foreground,
    fontFamily: family.semibold,
    fontSize: type.sm,
  },
  error: {
    marginTop: 8,
    color: palette.danger,
    fontFamily: family.normal,
    fontSize: type.xs,
    textAlign: "center",
  },
  row: { marginTop: 12, flexDirection: "row", gap: 10 },
  cancel: {
    minHeight: 44,
    minWidth: 100,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 18,
  },
  cancelText: { color: palette.muted, fontFamily: family.medium, fontSize: type.sm },
  danger: {
    minHeight: 44,
    minWidth: 100,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: palette.danger,
    paddingHorizontal: 18,
  },
  dangerText: { color: palette.foreground, fontFamily: family.bold, fontSize: type.sm },
});
