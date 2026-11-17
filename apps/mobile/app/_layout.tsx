import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { View } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { palette, base } from "@/theme";

/**
 * The root of the native app.
 *
 * Deliberately thin. What belongs here is what every screen needs before it
 * can draw: the safe-area provider, the status bar's colour, and holding the
 * splash screen until the fonts are in — a screen that renders text in the
 * system face and then swaps to Jakarta reflows every line, which is worse
 * than waiting a beat.
 *
 * NOT here: the Supabase client, which is a module and needs no provider,
 * and nothing resembling the web's shell. The web's (app)/layout.tsx carries
 * nine providers because it is one document that never unmounts; a native
 * app has a navigator, and putting the same nine here would be porting the
 * web's structure rather than building the app's.
 */

// Held until the fonts are ready. Failing to prevent auto-hide is not worth
// crashing over — the worst case is a frame of unstyled text.
void SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        // Loaded dynamically so a missing font file is a caught error rather
        // than a module that fails to evaluate and takes the app with it.
        // The five .ttf files are not in the repo yet — see assets/fonts.
        const { loadAsync } = await import("expo-font");
        const { fontAssets } = await import("@/fonts");
        await loadAsync(fontAssets);
      } catch {
        // No fonts: the app runs in the system face. A worse-looking app is
        // a far better outcome than one that will not start, and this is
        // the state until the Jakarta files are added.
      } finally {
        if (!cancelled) setReady(true);
        await SplashScreen.hideAsync().catch(() => {});
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // A plain ground rather than a spinner: the splash is still up, and this
  // is what shows for the frame between it hiding and the first screen.
  if (!ready) return <View style={base.screen} />;

  return (
    <SafeAreaProvider>
      {/* The app is dark-only, as the web is. */}
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.background },
          animation: "slide_from_right",
        }}
      />
    </SafeAreaProvider>
  );
}
