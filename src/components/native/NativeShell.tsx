"use client";

import { useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { App } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { isNative, isAndroidApp, safeNative } from "@/lib/native";
import { closeTopOverlay } from "@/lib/overlay-stack";
import { createClient } from "@/lib/supabase/client";
import { isAuthCallbackUrl, completeNativeSignIn } from "@/lib/native-auth";

/** Tab roots — back from here should leave the app, not unwind history. */
/**
 * Routes where back should quit rather than unwind.
 *
 * These are exactly the bottom-nav tabs — the places you can be without
 * having navigated forward to get there.
 *
 * /discover used to be in this list and is not a tab. You reach it by tapping
 * the compass on Home, which is a forward navigation, and hardware back then
 * closed the app instead of returning. It is also the only PageHeader in the
 * codebase without a back arrow, so there was no in-app way out either: the
 * bottom nav was the sole exit from a screen you had deliberately opened.
 */
const ROOT_ROUTES = ["/home", "/messages", "/shots", "/profile"];

/** Away this long and the screen is refreshed on return; less, and it is left alone. */
export const STALE_AFTER_MS = 30 * 60_000;

export function shouldRefreshOnResume(awayMs: number): boolean {
  return awayMs >= STALE_AFTER_MS;
}

/**
 * The native behaviours a WebView does not get for free.
 *
 * Without these the app is a browser in a frame: the hardware back button
 * closes it instead of navigating, the status bar renders with the wrong
 * contrast, and the splash screen hangs for a fixed duration whether or not
 * the page is ready. Each is small; together they are most of the difference
 * between "a website in an app" and an app.
 *
 * Renders nothing, and every effect is inert on the web — the same bundle
 * serves hypefy.chat in a browser.
 */
export function NativeShell() {
  const router = useRouter();
  const pathname = usePathname();

  // The back listener is bound once and lives for the life of the app, so it
  // reads the current path through a ref. Re-subscribing on every navigation
  // would leak a handler per route change.
  const pathnameRef = useRef(pathname);
  useEffect(() => { pathnameRef.current = pathname; }, [pathname]);

  // ── Chrome: status bar contrast, and dismiss the splash when React is up.
  useEffect(() => {
    if (!isNative()) return;
    void safeNative(async () => {
      // No StatusBar.setOverlaysWebView() here, deliberately. Whether the page
      // sits under the status bar is decided once, natively, before the page
      // loads (capacitor.config.ts), and headers pad by --sat for whatever
      // was decided. Flipping it from here, after the page had loaded, moved
      // the page down below the status bar without Android always re-sending
      // the insets — so --sat kept the status bar's height and the header
      // was pushed down twice, on the launches where hydration won that race.
      //
      // Style.Dark means dark *background* with light content — the opposite
      // of how the name reads, and the right one for our near-black chrome.
      await StatusBar.setStyle({ style: Style.Dark });
      if (isAndroidApp()) await StatusBar.setBackgroundColor({ color: "#0a0a0a" });
    });
    // Hidden here rather than on the configured timer: launchShowDuration is a
    // guess, while this fires exactly when the first screen can be shown.
    void safeNative(() => SplashScreen.hide());
  }, []);

  // ── Hardware back button.
  //
  // Android's back gesture is the primary navigation control, and Capacitor's
  // default is to exit the app on every press. That makes the app feel
  // disposable: one stray swipe from anywhere and you are on the home screen.
  useEffect(() => {
    if (!isAndroidApp()) return;
    let remove: (() => void) | undefined;

    void App.addListener("backButton", ({ canGoBack }) => {
      // Dismiss what is on top of the screen first. Without this, back with a
      // sheet open navigates the page away underneath it.
      if (closeTopOverlay()) return;

      // At a tab root there is nowhere back to go, so exiting is correct and
      // is what every other Android app does.
      if (!canGoBack || ROOT_ROUTES.includes(pathnameRef.current)) {
        void App.exitApp();
        return;
      }
      router.back();
    }).then((handle) => { remove = () => void handle.remove(); });

    return () => remove?.();
  }, [router]);

  // ── Deep links: the return leg of native Google sign-in.
  //
  // Google rejects OAuth in a WebView, so the consent screen opens in a
  // Custom Tab and hands the code back through `chat.hypefy://auth/callback`.
  // The exchange has to happen here, in the app, because a session created in
  // the Custom Tab lives in a cookie jar the WebView cannot read.
  useEffect(() => {
    if (!isNative()) return;
    let remove: (() => void) | undefined;

    void App.addListener("appUrlOpen", ({ url }) => {
      if (!isAuthCallbackUrl(url)) return;
      void completeNativeSignIn(createClient(), url).then((ok) => {
        // Either way land on "/" and let the existing entry router decide
        // between onboarding, profile setup and home — duplicating that
        // decision here would be a second source of truth for it.
        router.replace(ok ? "/" : "/signin?error=auth_failed");
        router.refresh();
      });
    }).then((handle) => { remove = () => void handle.remove(); });

    return () => remove?.();
  }, [router]);

  // ── Resume: come back to exactly what you left.
  //
  // This used to refresh the screen from the server on EVERY return, however
  // brief. On Home that swapped the feed you were reading for a newly ranked
  // one and dropped every page you had scrolled through, so glancing at a
  // notification and coming back felt like the app restarting. The live
  // screens catch up on their own now — a chat fetches what arrived while you
  // were away, the inbox refreshes its list — so the whole-screen refresh is
  // kept for a long absence only, when a fresh feed is what you would expect.
  const awaySince = useRef<number | null>(null);
  useEffect(() => {
    if (!isNative()) return;
    let remove: (() => void) | undefined;

    void App.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) {
        awaySince.current = Date.now();
        return;
      }
      const away = awaySince.current === null ? 0 : Date.now() - awaySince.current;
      awaySince.current = null;
      if (shouldRefreshOnResume(away)) router.refresh();
    }).then((handle) => { remove = () => void handle.remove(); });

    return () => remove?.();
  }, [router]);

  return null;
}
