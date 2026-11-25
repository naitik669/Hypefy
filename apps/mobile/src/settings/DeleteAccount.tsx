import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { ShieldCheck, Trash2 } from "lucide-react-native";
import { confirmWord, isArmed } from "@hypefy/core/account-delete";
import { supabase } from "@/supabase";
import { siteOrigin } from "@/site";
import {
  confirmIdentity,
  deleteMyAccount,
  stepUpFor,
  type DeleteAuth,
  type StepUp,
} from "@/settings/delete";
import { palette, type, family, radius } from "@/theme";

/**
 * Danger zone: permanent account deletion, inside the app.
 *
 * Google Play requires that an app which creates accounts lets them be
 * deleted from inside it. This is the website's Danger zone
 * (src/components/settings/DeleteAccount.tsx) with the same copy, the same
 * word to type, the same "Confirm it's you" step and the same route.
 *
 * One platform difference, written down as the project asks: the web's
 * step-up is a modal dialog; here it is the next step inside this same card.
 * A React Native Modal is a second native window with its own keyboard
 * handling, and a password field in it is the part of this flow most likely
 * to misbehave on a device nobody has tested — inline, the keyboard pushes
 * one ScrollView and nothing else.
 */
const auth: DeleteAuth = supabase.auth;

type Phase = "closed" | "typing" | "stepup";

export function DeleteAccount({ username }: { username: string | null }) {
  const word = confirmWord(username);
  const [phase, setPhase] = useState<Phase>("closed");
  const [typed, setTyped] = useState("");
  const [step, setStep] = useState<StepUp | null>(null);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const armed = isArmed(typed, username);

  const reset = () => {
    setPhase("closed");
    setTyped("");
    setSecret("");
    setStep(null);
    setError(null);
  };

  // "Delete forever": arm the step-up rather than deleting. Typing the
  // username guards against a mis-tap; this guards against someone else
  // holding an unlocked phone.
  const askIdentity = async () => {
    if (!armed || busy) return;
    setBusy(true);
    setError(null);
    try {
      setStep(await stepUpFor(auth));
      setPhase("stepup");
    } catch {
      setError("Couldn't reach Hypefy. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const destroy = async () => {
    if (!step || busy) return;
    setBusy(true);
    setError(null);
    try {
      const problem = await confirmIdentity(auth, step, secret);
      if (problem) {
        setError(problem);
        setSecret("");
        return;
      }
      const result = await deleteMyAccount({
        auth,
        site: siteOrigin(),
        transport: (url, init) => fetch(url, init),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.replace("/onboarding");
    } catch {
      setError("Deletion failed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.zone}>
      <Text style={styles.kicker}>Danger zone</Text>

      {phase === "closed" ? (
        <>
          <Text style={styles.note}>
            Permanently delete your account, posts, Shots, messages, and followers. This cannot be
            undone.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete account"
            onPress={() => setPhase("typing")}
            style={({ pressed }) => [styles.open, pressed && styles.pressed]}
          >
            <Trash2 size={15} color={palette.danger} />
            <Text style={styles.openText}>Delete account</Text>
          </Pressable>
        </>
      ) : phase === "typing" ? (
        <View style={styles.stack}>
          <Text style={styles.note}>
            Type <Text style={styles.word}>{word}</Text> to confirm. Everything is wiped, no
            recovery.
          </Text>
          <TextInput
            accessibilityLabel="Confirm word"
            value={typed}
            onChangeText={setTyped}
            placeholder={word}
            placeholderTextColor={palette.faint}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            style={styles.input}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.buttons}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              onPress={reset}
              style={styles.cancel}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete forever"
              accessibilityState={{ disabled: !armed || busy, busy }}
              disabled={!armed || busy}
              onPress={() => void askIdentity()}
              style={[styles.destroy, (!armed || busy) && styles.dim]}
            >
              {busy ? (
                <ActivityIndicator color={palette.foreground} />
              ) : (
                <Text style={styles.destroyText}>Delete forever</Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.stack}>
          <View style={styles.stepHead}>
            <ShieldCheck size={18} color={palette.accent} />
            <Text style={styles.stepTitle}>Confirm it&apos;s you</Text>
          </View>
          <Text style={styles.note}>
            {step?.mode === "totp"
              ? "Enter the current code from your authenticator app."
              : "Enter your password to continue."}
          </Text>
          <TextInput
            accessibilityLabel={step?.mode === "totp" ? "Authenticator code" : "Password"}
            value={secret}
            onChangeText={(v) => setSecret(step?.mode === "totp" ? v.replace(/\D/g, "") : v)}
            placeholder={step?.mode === "totp" ? "000000" : "Your password"}
            placeholderTextColor={palette.faint}
            secureTextEntry={step?.mode !== "totp"}
            keyboardType={step?.mode === "totp" ? "number-pad" : "default"}
            maxLength={step?.mode === "totp" ? 6 : undefined}
            autoComplete={step?.mode === "totp" ? "one-time-code" : "current-password"}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            onSubmitEditing={() => void destroy()}
            style={[styles.input, step?.mode === "totp" && styles.code]}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.buttons}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              disabled={busy}
              onPress={reset}
              style={styles.cancel}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Confirm and delete"
              accessibilityState={{ busy }}
              disabled={busy}
              onPress={() => void destroy()}
              style={[styles.destroy, busy && styles.dim]}
            >
              {busy ? (
                <ActivityIndicator color={palette.foreground} />
              ) : (
                <Text style={styles.destroyText}>Delete forever</Text>
              )}
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  zone: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: "rgba(255,69,69,0.3)",
    backgroundColor: "rgba(255,69,69,0.04)",
    padding: 16,
  },
  kicker: {
    color: palette.danger,
    fontFamily: family.semibold,
    fontSize: type.xs,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  note: { marginTop: 8, color: palette.muted, fontFamily: family.normal, fontSize: type.xs },
  word: { color: palette.foreground, fontFamily: family.bold },
  open: {
    marginTop: 12,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,69,69,0.4)",
  },
  openText: { color: palette.danger, fontFamily: family.bold, fontSize: type.sm },
  pressed: { backgroundColor: "rgba(255,69,69,0.1)" },
  stack: { marginTop: 4, gap: 8 },
  stepHead: { marginTop: 8, flexDirection: "row", alignItems: "center", gap: 8 },
  stepTitle: { color: palette.foreground, fontFamily: family.bold, fontSize: type.sm },
  input: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 16,
    color: palette.foreground,
    fontFamily: family.medium,
    fontSize: type.sm,
  },
  code: { textAlign: "center", fontSize: type.lg, letterSpacing: 5 },
  error: { color: palette.danger, fontFamily: family.normal, fontSize: type.xs },
  buttons: { flexDirection: "row", gap: 8 },
  cancel: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
  },
  cancelText: { color: palette.foreground, fontFamily: family.semibold, fontSize: type.sm },
  destroy: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: palette.danger,
  },
  dim: { opacity: 0.4 },
  destroyText: { color: palette.foreground, fontFamily: family.bold, fontSize: type.sm },
});
