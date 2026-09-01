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
