import { useEffect, useState } from "react";
import { Text, View, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/supabase";
import { base, palette, type, family, radius } from "@/theme";

/**
 * The only screen there is, and it exists to answer one question.
 *
 * Phase 5's acceptance criterion is "auth round-trips; session survives app
 * restart" — so this shows which of those is true, on the device, rather
 * than asking anybody to take it on trust. It reads the stored session at
 * launch and says what it found.
 *
 * There is no sign-in form here on purpose. Signing in needs the real
 * screen with its age gate, its consent copy and its OAuth button, and that
 * is Phase 6. What Phase 5 has to prove is the plumbing underneath: that a
 * session written to the Keychain comes back after the process is killed,
 * through the chunking that a 2.4KB Google session needs.
 */

type State =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "signed-in"; email: string; expires: string }
  | { kind: "error"; message: string };

export default function Index() {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        // getSession reads the store — the Keychain, through the chunked
        // adapter — rather than the network. That is exactly the thing this
        // screen is here to test.
        const { data, error } = await supabase.auth.getSession();
        if (cancelled) return;
        if (error) {
          setState({ kind: "error", message: error.message });
          return;
        }
        const session = data.session;
        if (!session) {
          setState({ kind: "signed-out" });
          return;
        }
        setState({
          kind: "signed-in",
          email: session.user.email ?? "(no email on this account)",
          expires: session.expires_at
            ? new Date(session.expires_at * 1000).toLocaleString()
            : "unknown",
        });
      } catch (e) {
        if (!cancelled) {
          setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={[base.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={base.centre}>
        <Text style={styles.mark}>
          H<Text style={styles.markDot}>.</Text>
        </Text>

        {state.kind === "loading" && <ActivityIndicator color={palette.accent} />}

        {state.kind === "signed-out" && (
          <>
            <Text style={base.title}>No session</Text>
            <Text style={[base.body, styles.gap]}>
              Nothing in the Keychain yet. Sign in on the web, or wait for the
              sign-in screen in Phase 6.
            </Text>
          </>
        )}

        {state.kind === "signed-in" && (
          <>
            <Text style={base.title}>Session restored</Text>
            <Text style={[base.body, styles.gap]}>{state.email}</Text>
            <Text style={[base.body, styles.faint]}>expires {state.expires}</Text>
            <Pressable
              accessibilityRole="button"
              style={styles.button}
              onPress={() => {
                void supabase.auth.signOut().then(() => setState({ kind: "signed-out" }));
              }}
            >
              <Text style={styles.buttonText}>Sign out</Text>
            </Pressable>
          </>
        )}

        {state.kind === "error" && (
          <>
            <Text style={base.title}>Something is wrong</Text>
            {/* The message verbatim. This screen is a diagnostic, and a
                friendly paraphrase here would hide the one thing worth
                knowing on a first device run. */}
            <Text style={[base.body, styles.gap]}>{state.message}</Text>
          </>
        )}
      </View>
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
  faint: { color: palette.faint, marginTop: 4, fontSize: type.xs },
  button: {
    marginTop: 24,
    backgroundColor: palette.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 22,
    paddingVertical: 11,
  },
  buttonText: {
    color: palette.accentInk,
    fontFamily: family.bold,
    fontSize: type.sm,
  },
});
