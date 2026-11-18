import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Eye, EyeOff } from "lucide-react-native";
import { router } from "expo-router";
import {
  MIN_AGE,
  MIN_PASSWORD,
  ageFromDob,
  signupMissing,
} from "@hypefy/core/signup-check";
import { nativeReturnUrl } from "@hypefy/core/native-auth-link";
import { supabase } from "@/supabase";
import { siteOrigin } from "@/site";
import { palette, type, family } from "@/theme";
import { GoogleGlyph } from "@/auth/GoogleGlyph";
import { DobField } from "@/auth/DobField";

/**
 * Sign in and create account, ported from the web's AuthCard.
 *
 * The copy is the web's `copy` table verbatim — title, subtitle, button,
 * the footer's question and its link — and the measurements are its
 * classes converted: a 360-wide card at radius 28 with 28 of padding,
 * 48-high fields at radius 12, a 48-high submit.
 *
 * What is SHARED rather than reimplemented is the part that matters most:
 * `signupMissing`, `MIN_PASSWORD`, `MIN_AGE` and `ageFromDob` all come from
 * @hypefy/core, so the password floor and the age gate are one rule for
 * both clients rather than two that agree today. `ageFromDob` was an inline
 * closure in the web component until this screen needed it; it is in core
 * now and the web imports it from there.
 *
 * Google goes out through the SITE's callback, not straight to the app's
 * own scheme — `nativeReturnUrl` says why — and comes back as a deep link
 * carrying a code, which app/auth/callback.tsx exchanges. No new native
 * module: `Linking.openURL` hands the URL to the system browser, which is
 * also where any Google session the person already has lives.
 *
 * Deliberately NOT here, and not pretended at:
 *
 *  - The frosted glass. The web's card is `bg-white/[0.04]` over
 *    `backdrop-blur-2xl`, and there is no filter in React Native. The card
 *    is a flat surface at the same radius; the blur would need expo-blur,
 *    a native module, which costs a cloud build and stops over-the-air
 *    delivery. A test fails if a hard-edged stand-in appears.
 *  - Adding a second account (`?add=1`). That is reached from Settings,
 *    which this app does not have yet, and the account switcher keeps
 *    refresh tokens in web storage — a decision of its own before it is
 *    ported.
 *  - E2EE's recovery-code screen. The flag is off and parked.
 */

type Mode = "signin" | "signup";

/** The web's `copy`, word for word. */
const COPY = {
  signin: {
    title: "Sign In",
    subtitle: "Please enter your details to sign in.",
    cta: "Sign in",
    googleLabel: "Continue with Google",
    footerText: "Don't have an account?",
    footerLink: "Sign up",
    footerHref: "/signup",
  },
  signup: {
    title: "Create account",
    subtitle: "Join Hypefy, where your personality lives.",
    cta: "Sign up",
    googleLabel: "Continue with Google",
    footerText: "Already have an account?",
    footerLink: "Sign in",
    footerHref: "/signin",
  },
} as const;

/** max-w-[360px] on the card. */
const CARD_W = 360;

export function AuthCard({ mode }: { mode: Mode }) {
  const t = COPY[mode];
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [dob, setDob] = useState("");
  const [consent, setConsent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const age = ageFromDob(dob);
  const signupBlocked = mode === "signup" && (!consent || age === null || age < MIN_AGE);
  const missing = mode === "signup" ? signupMissing({ email, password, dob, age, consent }) : null;

  const submit = useCallback(async () => {
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error: err } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (err) {
          setError(err.message);
          return;
        }
        // Spend the password and forget it.
        setPassword("");
        router.replace("/home");
        return;
      }

      // The same three gates the web applies, in the same order, before an
      // account is created rather than after.
      if (age === null || age < MIN_AGE) {
        setError(`You must be at least ${MIN_AGE} years old to use Hypefy.`);
        return;
      }
      if (!consent) {
        setError("Please accept the Terms, Privacy Policy, and Community Guidelines.");
        return;
      }
      if (password.length < MIN_PASSWORD) {
        setError(`Use at least ${MIN_PASSWORD} characters for your password.`);
        return;
      }

      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${siteOrigin()}/auth/callback`,
          data: { date_of_birth: dob, age_confirmed: true },
        },
      });
      if (err) {
        // Confirmations off: Supabase says so explicitly, and the web
        // sends the person to sign in with the address prefilled.
        if (/already registered|already exists|already in use/i.test(err.message)) {
          setError("That email is already registered. Sign in to continue.");
          return;
        }
        setError(err.message);
        return;
      }
      setPassword("");
      /*
       * Confirmations on: Supabase answers for an existing address exactly
       * as it would for a new one — a user with no identities and no email
       * sent — which is deliberate, so that typing an address cannot reveal
       * whether its owner is on Hypefy. Both outcomes get the same words
       * here for the same reason the web gives them the same screen.
       */
      if (data.session) {
        router.replace("/home");
        return;
      }
      setNotice(`Check ${email.trim()} for a link to finish signing up.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [mode, email, password, dob, age, consent]);

  /** The web's "Email me a code instead". */
  const emailCode = useCallback(async () => {
    const address = email.trim();
    if (!address) {
      setError("Add your email first.");
      return;
    }
    setError(null);
    setOtpLoading(true);
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email: address,
        options: { shouldCreateUser: false },
      });
      if (err) setError(err.message);
      else setNotice(`Code sent to ${address}.`);
    } finally {
      setOtpLoading(false);
    }
  }, [email]);

  const forgotPassword = useCallback(async () => {
    const address = email.trim();
    if (!address) {
      setError("Add your email first, then ask for a reset.");
      return;
    }
    setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(address, {
      redirectTo: `${siteOrigin()}/auth/callback?next=/reset-password`,
    });
    if (err) setError(err.message);
    else setNotice(`Reset link sent to ${address}.`);
  }, [email]);

  const google = useCallback(async () => {
    setError(null);
    /*
     * The same age and consent gate as the form, and said rather than
     * enforced by a dead button: the web's own comment makes the point
     * that a greyed-out Google button beside untouched fields reads as
     * "Google signup is broken".
     */
    if (mode === "signup") {
      if (age === null || age < MIN_AGE) {
        setError(`You must be at least ${MIN_AGE} years old to use Hypefy.`);
        return;
      }
      if (!consent) {
        setError("Please accept the Terms, Privacy Policy, and Community Guidelines.");
        return;
      }
    }
    setGoogleLoading(true);
    try {
      const { data, error: err } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: nativeReturnUrl(siteOrigin()),
          // The URL is wanted, not a navigation: there is no browser here
          // to redirect, and supabase-js would otherwise try.
          skipBrowserRedirect: true,
        },
      });
      if (err || !data?.url) {
        setError(err?.message ?? "Could not start Google sign-in.");
        return;
      }
      const opened = await Linking.canOpenURL(data.url);
      if (!opened) {
        setError("No browser is available to sign in with Google.");
        return;
      }
      await Linking.openURL(data.url);
      // The browser has it now. The deep link back into the app is what
      // finishes this, so nothing else happens here.
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start Google sign-in.");
    } finally {
      setGoogleLoading(false);
    }
  }, [mode, age, consent]);

  const canSubmit = !loading && !signupBlocked;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          {/* The wordmark is a brand stamp, not a title — it stays small and
              recessive so the task is what reads first. */}
          <View style={styles.header}>
            <Text style={styles.stamp}>
              Hypefy<Text style={styles.stampDot}>.</Text>
            </Text>
            <Text style={styles.title}>{t.title}</Text>
            <Text style={styles.subtitle}>{t.subtitle}</Text>
          </View>

          {notice && <Text style={styles.notice}>{notice}</Text>}

          <View style={[styles.form, notice ? styles.formTight : null]}>
            <TextInput
              accessibilityLabel="Email"
              placeholder="Enter your email address"
              placeholderTextColor={palette.faint}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              inputMode="email"
              editable={!loading}
              style={styles.input}
            />

            <View style={styles.passwordRow}>
              <TextInput
                accessibilityLabel="Password"
                placeholder="Password"
                placeholderTextColor={palette.faint}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                editable={!loading}
                onSubmitEditing={() => {
                  if (canSubmit) void submit();
                }}
                style={[styles.input, styles.passwordInput]}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                accessibilityState={{ selected: showPassword }}
                hitSlop={6}
                onPress={() => setShowPassword((v) => !v)}
                style={styles.eye}
              >
                {showPassword ? (
                  <EyeOff size={18} color={palette.faint} />
                ) : (
                  <Eye size={18} color={palette.faint} />
                )}
              </Pressable>
            </View>

            {mode === "signin" && (
              <View style={styles.helpers}>
                <Pressable
                  accessibilityRole="button"
                  disabled={otpLoading}
                  onPress={() => void emailCode()}
                  hitSlop={8}
                >
                  <Text style={[styles.helper, otpLoading && styles.helperBusy]}>
                    {otpLoading ? "Sending code…" : "Email me a code instead"}
                  </Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => void forgotPassword()} hitSlop={8}>
                  <Text style={styles.helper}>Forgot Password?</Text>
                </Pressable>
              </View>
            )}

            {mode === "signup" && (
              <>
                <View style={styles.field}>
                  <Text style={styles.label}>Date of birth</Text>
                  <DobField value={dob} onChange={setDob} editable={!loading} />
                </View>
                {age !== null && age < MIN_AGE && (
                  <Text style={styles.danger}>
                    You must be at least {MIN_AGE} years old to use Hypefy.
                  </Text>
                )}
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: consent }}
                  accessibilityLabel="I am 13 or older and agree to the Terms, Privacy Policy, and Community Guidelines"
                  onPress={() => setConsent((v) => !v)}
                  style={styles.consentRow}
                >
                  <View style={[styles.box, consent && styles.boxOn]}>
                    {consent && <Text style={styles.tick}>✓</Text>}
                  </View>
                  <Text style={styles.consentText}>
                    I am {MIN_AGE} or older and agree to the Terms, Privacy Policy, and
                    Community Guidelines.
                  </Text>
                </Pressable>
              </>
            )}

            {error && <Text style={styles.error}>{error}</Text>}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.cta}
              accessibilityState={{ disabled: !canSubmit, busy: loading }}
              disabled={!canSubmit}
              onPress={() => void submit()}
              style={({ pressed }) => [
                styles.submit,
                !canSubmit && styles.submitOff,
                pressed && styles.pressed,
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#000000" />
              ) : (
                <Text style={styles.submitText}>{t.cta}</Text>
              )}
            </Pressable>

            {missing && !loading && <Text style={styles.missing}>{missing}</Text>}
          </View>

          <View style={styles.or}>
            <View style={styles.rule} />
            <Text style={styles.orText}>OR</Text>
            <View style={styles.rule} />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.googleLabel}
            accessibilityState={{ busy: googleLoading }}
            disabled={googleLoading}
            onPress={() => void google()}
            style={({ pressed }) => [styles.google, pressed && styles.pressed]}
          >
            <GoogleGlyph size={18} />
            <Text style={styles.googleText}>
              {googleLoading ? "Redirecting…" : t.googleLabel}
            </Text>
          </Pressable>

          <View style={styles.footer}>
            <Text style={styles.footerText}>{t.footerText} </Text>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={t.footerLink}
              hitSlop={8}
              onPress={() => router.replace(t.footerHref)}
            >
              <Text style={styles.footerLink}>{t.footerLink}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  scroll: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },

  card: {
    width: "100%",
    maxWidth: CARD_W, // max-w-[360px]
    borderRadius: 28, // rounded-[28px]
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)", // border-white/10
    // bg-white/[0.04] over the page. The web puts backdrop-blur-2xl behind
    // it; RN has no filter, so this is the same fill without the blur.
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    padding: 28, // p-7
  },

  header: { alignItems: "center" },
  stamp: {
    color: "rgba(255, 255, 255, 0.6)", // text-foreground/60
    fontFamily: family.extrabold,
    fontSize: 15, // text-[15px]
    letterSpacing: -0.38,
  },
  stampDot: { color: palette.accent },
  title: {
    marginTop: 20, // mt-5
    color: palette.foreground,
    fontFamily: family.extrabold,
    fontSize: 26, // text-[26px]
    lineHeight: 26, // leading-none
    letterSpacing: -0.65,
  },
  subtitle: {
    marginTop: 8, // mt-2
    color: palette.muted,
    fontFamily: family.normal,
    fontSize: 13, // text-[13px]
    textAlign: "center",
  },

  notice: {
    marginTop: 20, // mt-5
    borderRadius: 12, // rounded-xl
    borderWidth: 1,
    borderColor: "rgba(163, 230, 53, 0.2)", // border-accent/20
    backgroundColor: "rgba(163, 230, 53, 0.1)", // bg-accent/10
    paddingHorizontal: 12, // px-3
    paddingVertical: 10, // py-2.5
    color: palette.accent,
    fontFamily: family.medium,
    fontSize: type.xs,
    textAlign: "center",
  },

  form: { marginTop: 24, gap: 12 }, // mt-6 gap-3
  formTight: { marginTop: 12 }, // mt-3 when a notice is up

  input: {
    height: 48, // h-12
    borderRadius: 12, // rounded-xl
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)", // border-white/5
    backgroundColor: "rgba(255, 255, 255, 0.06)", // bg-white/[0.06]
    paddingHorizontal: 16, // px-4
    color: palette.foreground,
    fontFamily: family.medium,
    fontSize: type.sm, // text-sm
  },
  passwordRow: { position: "relative", justifyContent: "center" },
  passwordInput: { paddingRight: 44 }, // pr-11
  eye: {
    position: "absolute",
    right: 4, // right-1
    height: 36, // h-9 w-9
    width: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8, // rounded-lg
  },

  helpers: {
    marginTop: -4, // -mt-1
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12, // gap-3
  },
  helper: { color: palette.muted, fontFamily: family.medium, fontSize: type.xs },
  helperBusy: { opacity: 0.6 }, // disabled:opacity-60

  field: { gap: 4 }, // flex-col gap-1
  label: {
    color: palette.muted,
    fontFamily: family.medium,
    fontSize: 11, // text-[11px]
  },
  danger: {
    color: palette.danger,
    fontFamily: family.normal,
    fontSize: 11, // text-[11px]
  },

  consentRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 }, // gap-2
  box: {
    marginTop: 2, // mt-0.5
    height: 16, // h-4 w-4
    width: 16,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: { backgroundColor: palette.accent, borderColor: palette.accent }, // accent-accent
  tick: { color: palette.accentInk, fontFamily: family.bold, fontSize: 11 },
  consentText: {
    flex: 1,
    color: palette.faint,
    fontFamily: family.normal,
    fontSize: 11, // text-[11px]
    lineHeight: 17.6, // leading-relaxed on 11px
  },

  error: {
    borderRadius: 8, // rounded-lg
    backgroundColor: "rgba(255, 69, 69, 0.1)", // bg-danger/10
    paddingHorizontal: 12, // px-3
    paddingVertical: 8, // py-2
    color: palette.danger,
    fontFamily: family.normal,
    fontSize: type.xs,
  },

  submit: {
    marginTop: 4, // mt-1
    height: 48, // h-12
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12, // rounded-xl
    // bg-white with black text — the one button in the app that is not
    // accent, and it is the web's choice, not a substitution.
    backgroundColor: "#ffffff",
  },
  submitOff: { opacity: 0.6 }, // disabled:opacity-60
  submitText: { color: "#000000", fontFamily: family.semibold, fontSize: type.sm },
  pressed: { transform: [{ scale: 0.99 }] }, // active:scale-[0.99]
  missing: {
    marginTop: -4, // -mt-1
    color: palette.muted,
    fontFamily: family.normal,
    fontSize: 11, // text-[11px]
    textAlign: "center",
  },

  or: {
    marginVertical: 20, // my-5
    flexDirection: "row",
    alignItems: "center",
    gap: 12, // gap-3
  },
  rule: { flex: 1, height: 1, backgroundColor: "rgba(255, 255, 255, 0.1)" }, // bg-white/10
  orText: {
    color: palette.faint,
    fontFamily: family.medium,
    fontSize: 11, // text-[11px]
    letterSpacing: 1.1, // tracking-widest
  },

  google: {
    height: 48, // h-12
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12, // gap-3
    borderRadius: 12, // rounded-xl
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)", // border-white/5
    backgroundColor: "rgba(255, 255, 255, 0.06)", // bg-white/[0.06]
  },
  googleText: {
    color: "rgba(255, 255, 255, 0.9)", // text-foreground/90
    fontFamily: family.medium,
    fontSize: type.sm,
  },

  footer: {
    marginTop: 24, // mt-6
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  footerText: { color: palette.muted, fontFamily: family.normal, fontSize: type.xs },
  footerLink: { color: palette.foreground, fontFamily: family.semibold, fontSize: type.xs },
});
