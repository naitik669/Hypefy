import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { supabase } from "@/supabase";
import { Placeholder } from "@/Placeholder";
import { SignOutRow } from "@/auth/SignOutRow";
import { base, palette, type, family, radius } from "@/theme";

/**
 * The Profile tab — a way into the viewer's OWN profile.
 *
 * It is not the profile screen itself. `/u/[username]` is, and this hands
 * over to it rather than rendering a second copy: a tab that drew its own
 * version of a profile is how the two would drift, and the only difference
 * between mine and someone else's is that mine has no Follow button, which
 * that screen already knows.
 *
 * The tab has to look up its own username first, because the route is
 * keyed by username and a session only carries an id. That lookup is why
 * this is a screen and not a redirect: it can fail, and a tab that shows
 * nothing while it fails is indistinguishable from one that is broken.
 *
 * Sign-out stays here. On the web it is in Settings, which is not ported,
 * and without it a signed-in device cannot reach the sign-in screens at
 * all — see #78, which is exactly how that was found.
 */
export default function ProfileTab() {
  const [username, setUsername] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function look(): Promise<{ username: string } | { problem: string }> {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) return { problem: "signed-out" };
        const { data: row } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", data.user.id)
          .maybeSingle();
        const name = (row as { username?: string | null } | null)?.username;
        if (!name) return { problem: "no-username" };
        return { username: name };
      } catch (e) {
        return { problem: e instanceof Error ? e.message : "unknown" };
      }
    }

    void look().then((result) => {
      if (cancelled) return;
      if ("problem" in result) {
        if (result.problem === "signed-out") {
          router.replace("/");
          return;
        }
        setProblem(result.problem);
        return;
      }
      setUsername(result.username);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (problem) {
    /*
     * Two different problems, said differently. "No username" means the
     * account never finished setup — the web would send them to
     * /setup-profile, which is not ported, so this says so rather than
     * routing nowhere. Anything else is a read that failed.
     */
    return (
      <View style={[base.screen, base.centre]}>
        <Text style={base.title}>
          {problem === "no-username" ? "Your profile is not set up" : "Could not open your profile"}
        </Text>
        <Text style={[base.body, styles.gap]}>
          {problem === "no-username"
            ? "Finish setting up your profile on app.hypefy.chat and it will appear here."
            : problem}
        </Text>
        <SignOutRow />
      </View>
    );
  }

  if (!username) {
    return (
      <View style={[base.screen, base.centre]}>
        <ActivityIndicator color={palette.accent} />
      </View>
    );
  }

  return (
    <Placeholder
      href="/profile"
      label="Your profile"
      blurb="Frames, nameplates, avatar decorations — the customisation the product is actually about. The marketplace browses here; buying stays on the web."
      footer={
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open your profile"
            onPress={() => router.push({ pathname: "/u/[username]", params: { username } })}
            style={({ pressed }) => [styles.open, pressed && styles.pressed]}
          >
            <Text style={styles.openText}>Open @{username}</Text>
          </Pressable>
          <SignOutRow />
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  gap: { marginTop: 10 },
  open: {
    marginTop: 20,
    backgroundColor: palette.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 22,
    minHeight: 44,
    minWidth: 140,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { transform: [{ scale: 0.98 }] },
  openText: { color: palette.accentInk, fontFamily: family.bold, fontSize: type.sm },
});
