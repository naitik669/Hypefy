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
    // Launch straight into the feed. "/" is a router: it asks Supabase who
    // you are, reads your profile, and answers with a redirect to /home —
    // a whole extra request before the app can even start loading, paid on
    // every cold start. Signed out, /home sends you to the landing instead.
    appStartPath: "/home",
    // A local, branded page when the site can't be reached, in place of the
    // WebView's own error screen. It is the same offline.html the service
    // worker serves on the web, copied into the app by `npx cap copy`.
    errorPath: "offline.html",
  },
  ios: {
    // Allow the WKWebView to reach getUserMedia (calls, shots, voice notes).
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    // Start with the page below the status bar. The plugin's default is to
    // lay the page under it, and NativeShell then moved it out a moment after
    // launch — a layout change mid-launch that older WebViews reported late,
    // so some launches padded the header for a status bar it was already
    // below. Takes effect from the next native build; until then the CSS
    // safe-area variables (see globals.css) keep the header right.
    StatusBar: {
      overlaysWebView: false,
      style: "DARK",
      backgroundColor: "#0a0a0a",
    },
    // The launch artwork is also the window's background (styles.xml), so
    // when the splash goes the same mark is still behind the WebView until
    // the page paints. That gap used to be black, and a black screen is what
    // makes a launch feel slow even when it isn't.
    SplashScreen: {
      launchShowDuration: 800,
      launchFadeOutDuration: 200,
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
