"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { GA_ID, gaDebug, gaEnabled } from "@/lib/analytics";

/**
 * Google Analytics 4.
 *
 * Renders nothing. Loads gtag.js once, after mount, and only for a reader the
 * gate in lib/analytics.ts allows — see that file for why a developer's
 * reloads and an EEA reader are both excluded.
 *
 * Mounted alongside Vercel Analytics rather than instead of it: they measure
 * different things and neither replaces the other. Vercel's is server-side,
 * cookieless and about delivery; this one is about behaviour across a session.
 *
 * Page views are sent by hand.
 *
 * `gtag('config')` fires one on load and then nothing again, because a
 * client-side route change in the App Router is not a document load — the URL
 * changes and the page never navigates. GA4's enhanced measurement can pick
 * those up from history events, but whether it does is a checkbox in a web
 * interface rather than something this code can rely on, and the failure is
 * silent: every screen after the first simply goes unrecorded. So
 * send_page_view is off and every view, including the first, is sent below.
 *
 * pathname alone drives the effect, and the full URL is read from
 * `window.location` when it fires. useSearchParams would opt this component —
 * and therefore the root layout, and therefore every page in the app — out of
 * static rendering, which is a steep price for a query string that
 * page_location already carries.
 *
 * If GA4's Enhanced Measurement has "page changes based on browser history
 * events" switched on, turn it OFF for this property: it would send its own
 * page_view alongside these and every screen would count twice.
 */
export function GoogleAnalytics({ country }: { country: string | null }) {
  const pathname = usePathname();
  const loaded = useRef(false);

  // Load once.
  useEffect(() => {
    if (loaded.current) return;
    if (!gaEnabled({ country })) return;
    loaded.current = true;

    const w = window as typeof window & {
      dataLayer?: unknown[];
      gtag?: (...args: unknown[]) => void;
    };
    w.dataLayer = w.dataLayer || [];

    // Google's shim, unchanged in substance: it pushes the `arguments` object
    // itself, not an array of them. gtag reads it as an arguments object on
    // the other side, so this is one of the few places where the old form is
    // the correct one rather than the dated one.
    function gtag() {
      // eslint-disable-next-line prefer-rest-params
      w.dataLayer!.push(arguments);
    }
    w.gtag = gtag as unknown as (...args: unknown[]) => void;

    w.gtag("js", new Date());
    w.gtag("config", GA_ID, {
      // See the note above — views are sent from the effect below.
      send_page_view: false,
      // In debug mode hits land in GA's DebugView rather than the reports, so
      // a development machine can be verified without being counted.
      ...(gaDebug() ? { debug_mode: true } : {}),
    });

    const el = document.createElement("script");
    el.async = true;
    el.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
    // Blocked by an extension is the expected case, not an error worth
    // reporting. The queued dataLayer calls simply never drain.
    el.onerror = () => {};
    document.head.appendChild(el);
  }, [country]);

  // One page view per URL, including the first.
  useEffect(() => {
    if (!loaded.current) return;
    const w = window as typeof window & { gtag?: (...a: unknown[]) => void };
    if (!w.gtag) return;

    // page_location and page_title only. page_path is a Universal Analytics
    // parameter: GA4 drops it, and a hit sent with it arrives carrying an
    // ep.page_path of null — which looks like working instrumentation right
    // up until someone tries to report on it. GA4 derives the path from
    // page_location itself.
    w.gtag("event", "page_view", {
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [pathname]);

  // Back and forward, restored from the browser's cache.
  //
  // A bfcache restore re-shows the page without re-running a single effect, so
  // the hook above never fires and the visit goes unrecorded — invisible in
  // testing, because the browser only uses the cache under conditions a
  // scripted navigation rarely reproduces. pageshow with persisted set is the
  // one signal that distinguishes a restore from a fresh load.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (!e.persisted || !loaded.current) return;
      const w = window as typeof window & { gtag?: (...a: unknown[]) => void };
      w.gtag?.("event", "page_view", {
        page_location: window.location.href,
        page_title: document.title,
      });
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  return null;
}
