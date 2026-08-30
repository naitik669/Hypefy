"use client";

import { useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { App } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { isNative, isAndroidApp, safeNative } from "@/lib/native";

/** Tab roots — back from here should leave the app, not unwind history. */
const ROOT_ROUTES = ["/home", "/discover", "/messages", "/shots", "/profile"];

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

  // ── Resume: re-check server state after the app was backgrounded.
  //
  // A WebView that sat in the background for hours comes back showing stale
  // data; a native app is expected to be current the moment it opens.
  useEffect(() => {
    if (!isNative()) return;
    let remove: (() => void) | undefined;

    void App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) router.refresh();
    }).then((handle) => { remove = () => void handle.remove(); });

    return () => remove?.();
  }, [router]);

  return null;
}
