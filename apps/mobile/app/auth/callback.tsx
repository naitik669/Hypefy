import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "@/supabase";
import { base, palette, type, family, radius } from "@/theme";

/**
 * Where Google sign-in comes back to: `chat.hypefy://auth/callback`.
 *
 * The round trip is deliberately long. The app opens Google in the system
 * browser; Google returns to the WEBSITE's `/auth/callback?app=1`; that
 * route strips everything except `code` and the two error fields and
 * bounces them to this scheme. @hypefy/core's `nativeReturnUrl` explains
 * why it goes through the site: the only redirect Supabase has to allow is
 * the one web sign-in already needs. When the app's own link was not on
 * that list, Supabase quietly sent people to the website instead and they
 * ended up signed in to a browser tab.
 *
 * So what arrives here is an authorization code, and the job is to trade it
 * for a session. The PKCE verifier that trade needs was written to the
 * Keychain when the flow started and is read back by the same client — see
 * `flowType: "pkce"` in supabase.ts, which is set explicitly because the
 * implicit flow would leave nothing to exchange.
 *
 * It reports what happened rather than redirecting silently on failure: a
 * sign-in that lands back on the sign-in screen with no explanation is the
 * failure people describe as "it just doesn't work".
 */

type State =
  | { kind: "working" }
  | { kind: "done" }
  | { kind: "failed"; message: string };

export default function AuthCallback() {
  const params = useLocalSearchParams<{
    code?: string;
    error?: string;
    error_description?: string;
  }>();
  const [state, setState] = useState<State>({ kind: "working" });

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      // Google's own refusal — a cancelled consent screen arrives here.
      if (params.error) {
        return {
          kind: "failed" as const,
          message: params.error_description || params.error,
        };
      }
      if (!params.code) {
        return {
          kind: "failed" as const,
          message: "That sign-in link carried no code. Try again.",
        };
      }
      try {
        const { data, error } = await supabase.auth.exchangeCodeForSession(params.code);
        if (error) return { kind: "failed" as const, message: error.message };
        // Read it back from the store rather than trusting the response, so
        // an exchange that succeeded and failed to persist shows up now
        // instead of on the next launch.
        const { data: stored } = await supabase.auth.getSession();
        if (!stored.session) {
          return {
            kind: "failed" as const,
            message: "Signed in, but the session did not save. Try again.",
          };
        }
        if (!data.session) {
          return {
            kind: "failed" as const,
            message: "Signed in, but no session came back. Try again.",
          };
        }
        return { kind: "done" as const };
      } catch (e) {
        return {
          kind: "failed" as const,
          message: e instanceof Error ? e.message : "Sign-in could not be completed.",
        };
      }
    }

    void finish().then((next) => {
      if (cancelled) return;
      setState(next);
      if (next.kind === "done") router.replace("/home");
    });

    return () => {
      cancelled = true;
    };
  }, [params.code, params.error, params.error_description]);

  return (
    <View style={[base.screen, base.centre]}>
      <Text style={styles.mark}>
        H<Text style={styles.markDot}>.</Text>
      </Text>

      {state.kind !== "failed" ? (
        <>
          <ActivityIndicator color={palette.accent} />
          <Text style={[base.body, styles.gap]}>Finishing sign-in…</Text>
        </>
      ) : (
        <>
          <Text style={base.title}>Sign-in did not finish</Text>
          {/* The message verbatim. A friendly paraphrase here hides the one
              thing worth knowing, and this screen is only ever reached when
              something has already gone wrong. */}
          <Text style={[base.body, styles.gap]}>{state.message}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to sign in"
            style={styles.button}
            onPress={() => router.replace("/signin")}
          >
            <Text style={styles.buttonText}>Back to sign in</Text>
          </Pressable>
        </>
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
