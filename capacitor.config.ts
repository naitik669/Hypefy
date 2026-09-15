import type { CapacitorConfig } from "@capacitor/cli";
import { KeyboardResize } from "@capacitor/keyboard";

/**
 * Hypefy is a server-rendered Next.js app (SSR + proxy + API routes), so it
 * can't be statically bundled into the native app. Instead the native shell
 * loads the live site at server.url — auth already uses window.location.origin,
 * so sessions resolve against the production origin with no code change.
 *
 * webDir points at `public` only to satisfy Capacitor's requirement for a local
 * web directory; nothing from it is actually served when server.url is set.
 *
 * OAuth deep-linking (C2) and native push (C3) are layered on top of this base.
 */
const config: CapacitorConfig = {
  appId: "chat.hypefy.app",
  appName: "Hypefy",
  webDir: "public",
  server: {
    url: "https://app.hypefy.chat",
    cleartext: false,
  },
  ios: {
    // Allow the WKWebView to reach getUserMedia (calls, shots, voice notes).
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    // Start with the page below the status bar, decided here before the page
    // loads and never changed afterwards. (NativeShell used to flip it after
    // launch, which left --sat holding the status bar's height on some
    // launches: the header sat low by exactly that much.) Takes effect from
    // the next native build; older builds keep the page under the status bar
    // and pad by --sat, which is equally right.
    StatusBar: {
      overlaysWebView: false,
      style: "DARK",
      backgroundColor: "#0a0a0a",
    },
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: "#0a0a0a",
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    Keyboard: {
      // `native` lets Android resize the window itself, so the layout is
      // shortened above the keyboard. The alternative, `body`, resizes the
      // document and fights the app's own dvh-based layout; leaving it unset
      // pans the WebView instead, which is what buries the chat composer.
      resize: KeyboardResize.Native,
      resizeOnFullScreen: true,
    },
  },
};

export default config;
