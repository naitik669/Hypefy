/**
 * Hypefy service worker — web push + a minimal offline shell.
 *
 * Deliberately NOT a full offline cache: navigations are always network-first,
 * so online users never get a stale HTML/JS bundle after a deploy. The only
 * thing cached is a fully self-contained static `offline.html`, served purely
 * as a fallback when a navigation fails because the device is offline.
 */
// Bump whenever offline.html changes: a new name is what makes installed
// workers update and re-cache it (the activate step drops the old one).
const OFFLINE_CACHE = "hypefy-offline-v2";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.add(OFFLINE_URL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== OFFLINE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/**
 * Only intercept page navigations. Try the network first (fresh content, no
 * stale bundles); if it fails — i.e. the user is offline — fall back to the
 * cached branded offline page. All other requests (assets, API, RSC) pass
 * straight through to the network untouched.
 */
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.mode !== "navigate") return;
  event.respondWith(
    fetch(req).catch(() =>
      caches.match(OFFLINE_URL, { ignoreSearch: true }).then((res) => res ?? Response.error()),
    ),
  );
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Hypefy", body: event.data.text() };
  }

  const title = payload.title || "Hypefy";
  const options = {
    body: payload.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: payload.url || "/notifications" },
    tag: payload.tag || undefined, // collapse duplicate pings
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/notifications";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Focus an existing Hypefy tab if one is open
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
