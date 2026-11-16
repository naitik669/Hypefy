"use client";

import { installKv } from "@hypefy/core/kv";
import { webKv } from "@/lib/kv-web";

/**
 * Hands the shared core the web's key-value store, once, as early as there
 * is a client at all.
 *
 * At MODULE scope rather than in an effect, deliberately. The consumers read
 * during render — `readSpeed()` returns a number straight out, and the
 * picker calls `loadRecentSearches()` while rendering its list — so a store
 * installed in an effect arrives after the first read. That read would get
 * `absentKv`, return the fallback, and the component would settle on it
 * until something re-rendered: a remembered choice that appears not to have
 * been remembered, which is exactly the bug the interface exists to avoid.
 *
 * In the root layout rather than the app shell, because the modules behind
 * this are used on public routes too — the sign-in page and the song picker
 * both reach them, and neither goes through (app)/layout.tsx.
 *
 * It renders nothing. The component exists so the import cannot be tree
 * shaken away: a side-effect-only import of a client module from a server
 * component is exactly the shape a bundler is entitled to drop.
 */
installKv(webKv);

export function InstallKv() {
  return null;
}
