import { useCallback, useEffect, useState } from "react";
import {
  Text,
  View,
  Pressable,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
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
 * The sign-in below is the diagnostic half of that, and it is deliberately
 * the plainest thing that works: two fields and a button. The REAL sign-in
 * screen — age gate, consent copy, OAuth, the recovery path — is Phase 6,
 * and this is not a first draft of it.
 *
 * It is here because without it the criterion cannot be tested at all. An
 * earlier version of this screen deferred signing in to Phase 6 and told
 * the reader to "sign in on the web", which does not work: the web writes
 * its session to localStorage in a browser, and this app reads the device
 * Keychain. There was no path by which a session could arrive, so the build
 * could only ever report "No session" and the plumbing underneath — the
 * Keychain write, and the chunking a 2.4KB Google session needs to get past
 * the 2KB per-item limit — would have gone unexercised.
 *
 * Email and password only. OAuth needs the deep-link round trip, which is
 * its own verification and not the one Phase 5 is for.
 */

type State =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "signed-in"; email: string; expires: string }
  | { kind: "error"; message: string };

export default function Index() {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  /**
   * Reads the stored session. getSession goes to the store — the Keychain,
   * through the chunked adapter — not to the network, which is exactly the
   * thing this screen is here to test.
   */
  const loadSession = useCallback(async (): Promise<State> => {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) return { kind: "error", message: error.message };
      const session = data.session;
      if (!session) return { kind: "signed-out" };
      return {
        kind: "signed-in",
        email: session.user.email ?? "(no email on this account)",
        expires: session.expires_at
          ? new Date(session.expires_at * 1000).toLocaleString()
          : "unknown",
      };
    } catch (e) {
      return { kind: "error", message: e instanceof Error ? e.message : String(e) };
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadSession().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [loadSession]);

  const signIn = useCallback(async () => {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setState({ kind: "error", message: error.message });
        return;
      }
      // Clear the password out of component state the moment it is spent.
      setPassword("");
      // Read it back from the STORE rather than trusting the response, so a
      // successful sign-in that failed to persist shows up here instead of
      // on the next launch.
      setState(await loadSession());
    } finally {
      setBusy(false);
    }
  }, [email, password, loadSession]);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !busy;

  return (
    <KeyboardAvoidingView
      style={[base.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={base.centre}>
        <Text style={styles.mark}>
          H<Text style={styles.markDot}>.</Text>
        </Text>

        {state.kind === "loading" && <ActivityIndicator color={palette.accent} />}

        {(state.kind === "signed-out" || state.kind === "error") && (
          <>
            {state.kind === "signed-out" ? (
              <Text style={base.title}>No session</Text>
            ) : (
              <>
                <Text style={base.title}>Something is wrong</Text>
                {/* The message verbatim. This screen is a diagnostic, and a
                    friendly paraphrase would hide the one thing worth
                    knowing on a first device run. */}
                <Text style={[base.body, styles.gap]}>{state.message}</Text>
              </>
            )}

            <Text style={[base.body, styles.gap]}>
              Sign in to write a session to the Keychain, then force-stop the
              app and reopen it.
            </Text>

            <TextInput
              accessibilityLabel="Email"
              placeholder="Email"
              placeholderTextColor={palette.faint}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              inputMode="email"
              editable={!busy}
              style={styles.input}
            />
            <TextInput
              accessibilityLabel="Password"
              placeholder="Password"
              placeholderTextColor={palette.faint}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
              editable={!busy}
              onSubmitEditing={() => {
                if (canSubmit) void signIn();
              }}
              style={styles.input}
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign in"
              accessibilityState={{ disabled: !canSubmit, busy }}
              disabled={!canSubmit}
              style={[styles.button, !canSubmit && styles.buttonDisabled]}
              onPress={() => void signIn()}
            >
              {busy ? (
                <ActivityIndicator color={palette.accentInk} />
              ) : (
                <Text style={styles.buttonText}>Sign in</Text>
              )}
            </Pressable>
          </>
        )}

        {state.kind === "signed-in" && (
          <>
            <Text style={base.title}>Session restored</Text>
            <Text style={[base.body, styles.gap]}>{state.email}</Text>
            <Text style={[base.body, styles.faint]}>expires {state.expires}</Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open Hypefy"
              style={styles.button}
              onPress={() => router.replace("/home")}
            >
              <Text style={styles.buttonText}>Open Hypefy</Text>
            </Pressable>

            {/* Secondary, and deliberately so. This screen's job is the
                Phase 5 diagnostic; signing out is how you re-run it, not
                something anyone should hit by accident on the way in. */}
            <Pressable
              accessibilityRole="button"
              style={styles.secondary}
              onPress={() => {
                void supabase.auth.signOut().then(() => setState({ kind: "signed-out" }));
              }}
            >
              <Text style={styles.secondaryText}>Sign out</Text>
            </Pressable>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
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
  input: {
    marginTop: 12,
    width: "100%",
    maxWidth: 320,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.card,
    color: palette.foreground,
    fontFamily: family.medium,
    fontSize: type.base,
    paddingHorizontal: 14,
    // 48dp of target even before the border, per the touch-target rule.
    paddingVertical: 13,
  },
  button: {
    marginTop: 24,
    backgroundColor: palette.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 22,
    paddingVertical: 11,
    minHeight: 44,
    minWidth: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: {
    color: palette.accentInk,
    fontFamily: family.bold,
    fontSize: type.sm,
  },
  secondary: {
    marginTop: 10,
    paddingHorizontal: 22,
    // 44 of target even though it reads as a text link.
    minHeight: 44,
    justifyContent: "center",
  },
  secondaryText: {
    color: palette.muted,
    fontFamily: family.medium,
    fontSize: type.sm,
    textAlign: "center",
  },
});
