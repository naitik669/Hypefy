import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { BellRing } from "lucide-react-native";
import { supabase } from "@/supabase";
import { enablePush, pushPermission } from "@/notifications/push";
import { palette, type, family, radius } from "@/theme";

/**
 * Turning push on, asked where the website asks: at the top of Activity.
 *
 * Its own comment says why, and it is right — somebody checking their
 * notifications is exactly who wants pings. The same copy, because this is a
 * pitch and the website's words for it were chosen.
 *
 * **Three permission states, not two.** Android shows the system prompt once;
 * after a refusal it ignores every further request silently. So "not asked
 * yet" offers a button that works, and "refused" names the setting instead —
 * a button that cannot do anything is worse than an instruction.
 *
 * **No snooze, and that is deliberate.** The website hides this for a
 * fortnight in localStorage. This app has no key-value store installed (see
 * @hypefy/core/kv — a memory default appears to work for a session and then
 * everything is gone), so a Dismiss here would come back on the next launch
 * while looking as though it had been remembered. The card goes away when
 * push is on, which is the one state it is asking for.
 */
export function PushNudge() {
  const [state, setState] = useState<"granted" | "denied" | "ask" | "unknown">("unknown");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void pushPermission().then((p) => {
      if (!cancelled) setState(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const turnOn = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      setBusy(false);
      return;
    }
    const result = await enablePush(supabase as never, data.user.id);
    setBusy(false);
    if (result === "registered") setState("granted");
    else if (result === "denied") setState("denied");
    // "failed" is a device that cannot register — no Play Services, or a
    // broken FCM config. Not a refusal, and not something the person did,
    // so it keeps the button rather than sending them to a setting that
    // would not help.
    else setFailed(true);
  }, [busy]);

  if (state === "granted" || state === "unknown") return null;

  return (
    <View style={styles.card}>
      <View style={styles.tile}>
        <BellRing size={18} color={palette.accent} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>
          Never miss these<Text style={styles.dot}>.</Text>
        </Text>
        <Text style={styles.sub} numberOfLines={2}>
          {state === "denied"
            ? "Notifications are turned off for Hypefy in your phone's settings."
            : failed
              ? "Couldn't turn on push. Try again in a moment."
              : "Get hypes and replies even when Hypefy is closed."}
        </Text>
      </View>
      {state === "ask" && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Turn on notifications"
          accessibilityState={{ disabled: busy, busy }}
          disabled={busy}
          onPress={() => void turnOn()}
          style={({ pressed }) => [styles.button, busy && styles.dim, pressed && styles.dim]}
        >
          {busy ? (
            <ActivityIndicator color={palette.accentInk} size="small" />
          ) : (
            <Text style={styles.buttonText}>Turn on</Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  tile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.background,
  },
  text: { flex: 1, minWidth: 0 },
  title: { color: palette.foreground, fontFamily: family.bold, fontSize: type.sm },
  dot: { color: palette.accent },
  sub: { marginTop: 2, color: palette.muted, fontFamily: family.normal, fontSize: type.xs },
  button: {
    minHeight: 36,
    minWidth: 76,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: palette.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  dim: { opacity: 0.6 },
  buttonText: { color: palette.accentInk, fontFamily: family.bold, fontSize: type.xs },
});
