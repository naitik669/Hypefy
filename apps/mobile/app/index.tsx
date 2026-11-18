import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { supabase } from "@/supabase";
import { entryFor, routeFor, type Entry } from "@/auth/entry";
import { base, palette, type, family, radius } from "@/theme";

/**
 * The entry router, as the web has it at `/`.
 *
 * The web's RootPage reads: signed out goes to /onboarding, signed in with
 * an incomplete profile goes to /setup-profile, and otherwise /home. The
 * first and the last are here. The middle one is NOT, and this screen
 * deliberately does not pretend to route to it: the profile setup stepper
 * is its own screen and lands with the rest of the profile work, and
 * sending someone to a route that does not exist would be worse than
 * sending them to the feed they can at least use.
 *
 * This replaces the Phase 5 diagnostic screen, which was the only way to
 * sign in on the phone and said so. Its job is done: the real sign-in
 * screen exists, so a screen whose purpose was to prove the Keychain
 * round-trips has no reason to stay in front of everybody. What it proved
 * is still proved here, because this reads the stored session too.
 *
 * The decision itself lives in @/auth/entry, where a test can call it —
 * the one thing that matters here is that a session which FAILED TO READ
 * is not treated as a session that is absent, and that is not something a
 * test can see by reading this file.
 */
export default function Index() {
  const [entry, setEntry] = useState<Entry | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function look(): Promise<Entry> {
      try {
        const { data, error } = await supabase.auth.getSession();
        return entryFor({ session: data?.session ?? null, error });
      } catch (e) {
        return entryFor({
          session: null,
          error: { message: e instanceof Error ? e.message : String(e) },
        });
      }
    }

    void look().then((next) => {
      if (cancelled) return;
      setEntry(next);
      const to = routeFor(next);
      if (to) router.replace(to);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={[base.screen, base.centre]}>
      <Text style={styles.mark}>
        H<Text style={styles.markDot}>.</Text>
      </Text>

      {entry?.kind === "failed" ? (
        <>
          <Text style={base.title}>Could not read your session</Text>
          {/* The message verbatim. This is only reached when something has
              already gone wrong, and a paraphrase would hide the one thing
              worth knowing. */}
          <Text style={[base.body, styles.gap]}>{entry.message}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign in"
            style={styles.button}
            onPress={() => router.replace("/signin")}
          >
            <Text style={styles.buttonText}>Sign in</Text>
          </Pressable>
        </>
      ) : (
        <ActivityIndicator color={palette.accent} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    color: palette.foreground,
    fontFamily: family.extrabold,
    fontSize: 44,
    letterSpacing: -2,
    marginBottom: 16,
  },
  markDot: { color: palette.accent },
  gap: { marginTop: 10 },
  button: {
    marginTop: 24,
    backgroundColor: palette.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 22,
    minHeight: 44,
    minWidth: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: palette.accentInk, fontFamily: family.bold, fontSize: type.sm },
});
