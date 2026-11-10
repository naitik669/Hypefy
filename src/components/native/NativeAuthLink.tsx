"use client";

import { useEffect } from "react";
import { App } from "@capacitor/app";
import { isNative } from "@/lib/native";
import { createClient } from "@/lib/supabase/client";
import { isAuthCallbackUrl, completeNativeSignIn } from "@/lib/native-auth";

/**
 * The return leg of native Google sign-in.
 *
 * Google rejects OAuth inside a WebView, so the consent screen opens in
 * a Custom Tab and hands the code back through `chat.hypefy://auth/
 * callback`. The exchange has to happen in the app, because a session
 * created in the Custom Tab lives in a cookie jar the WebView cannot
 * read.
 *
 * **This lives in the root layout, and that is the whole point.** It
 * used to sit inside NativeShell, which the (app) layout only renders
 * for a signed-in user — it returns a bare shell and never reaches
 * NativeShell when there is no session. So on /signin, the one screen
 * where a Google sign-in actually begins, no `appUrlOpen` listener
 * existed. Capacitor does not replay the event to listeners added
 * later, so the deep link arrived, found nobody listening, and the app
 * came back to the foreground still on the sign-in card with no
 * session and no error. Native Google sign-in could never complete.
 */
export function NativeAuthLink() {
  useEffect(() => {
    if (!isNative()) return;
    let remove: (() => void) | undefined;

    /**
     * Codes already handed to the exchange.
     *
     * The interstitial both redirects itself and offers an "Open
     * Hypefy" button, and Android can deliver the same intent twice.
     * The second exchange always fails — the code is spent — and
     * without this guard that failure would send an already-signed-in
     * user back to /signin.
     */
    const used = new Set<string>();

    void App.addListener("appUrlOpen", ({ url }) => {
      if (!isAuthCallbackUrl(url)) return;

      let code: string | null = null;
      try {
        code = new URL(url).searchParams.get("code");
      } catch {
        // A malformed deep link is not ours to finish.
        return;
      }
      if (!code || used.has(code)) return;
      used.add(code);

      void completeNativeSignIn(createClient(), url).then((ok) => {
        // A hard navigation, not router.replace. Next's router cache
        // holds payloads rendered while signed out, and this is the
        // moment that stops being true — AuthCard says the same thing
        // about the same hazard in two places.
        window.location.href = ok ? "/" : "/signin?error=auth_failed";
      });
    }).then((handle) => {
      remove = () => void handle.remove();
    });

    return () => remove?.();
  }, []);

  return null;
}
