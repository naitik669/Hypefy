"use client";

/**
 * Web Playback SDK wrapper — full-length Spotify playback in the browser.
 *
 * Only usable by a signed-in Premium listener; /api/spotify/token returns 409
 * for anything else, which is how this module learns it cannot play without
 * waiting for an opaque failure inside Spotify's own player.
 *
 * Starting a track is a Web API call rather than an SDK method, because the
 * SDK has no way to begin at an offset and snippets need one. The SDK owns
 * everything after that: pause, resume, state, teardown.
 */

const SDK_SRC = "https://sdk.scdn.co/spotify-player.js";

type SpotifyPlayer = {
  connect: () => Promise<boolean>;
  disconnect: () => void;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  activateElement: () => Promise<void>;
  addListener: (event: string, cb: (payload: never) => void) => boolean;
};

declare global {
  interface Window {
    Spotify?: {
      Player: new (opts: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume?: number;
      }) => SpotifyPlayer;
    };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

export type SpotifyStatus =
  | "idle"
  | "loading"
  | "ready"
  | "not_connected"
  | "not_premium"
  | "failed";

let player: SpotifyPlayer | null = null;
let deviceId: string | null = null;
let status: SpotifyStatus = "idle";
let initPromise: Promise<SpotifyStatus> | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function setStatus(next: SpotifyStatus) {
  if (status === next) return;
  status = next;
  emit();
}

export function getSpotifyStatus(): SpotifyStatus {
  return status;
}

export function subscribeSpotify(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Fresh access token, straight from the server each time. Tokens last an
 *  hour and the route refreshes transparently, so there is nothing to cache
 *  here — and caching would risk handing the SDK a dead one. */
async function fetchToken(): Promise<{ token?: string; status: SpotifyStatus }> {
  const res = await fetch("/api/spotify/token", { cache: "no-store" });
  if (res.ok) return { token: (await res.json()).accessToken, status: "ready" };
  if (res.status === 409) return { status: "not_premium" };
  if (res.status === 404 || res.status === 401) return { status: "not_connected" };
  return { status: "failed" };
}

function loadSdkScript(): Promise<void> {
  if (window.Spotify) return Promise.resolve();
  return new Promise((resolve, reject) => {
    // The SDK calls this global the moment it finishes parsing; it must exist
    // before the script tag is added or the callback is missed entirely.
    const prev = window.onSpotifyWebPlaybackSDKReady;
    window.onSpotifyWebPlaybackSDKReady = () => { prev?.(); resolve(); };

    const existing = document.querySelector(`script[src="${SDK_SRC}"]`);
    if (existing) return; // already loading; the callback above will fire

    const el = document.createElement("script");
    el.src = SDK_SRC;
    el.async = true;
    el.onerror = () => reject(new Error("spotify sdk failed to load"));
    document.body.appendChild(el);
  });
}

/**
 * Bring the player up. Safe to call repeatedly — the work happens once and
 * every later caller awaits the same promise.
 */
export function initSpotifyPlayer(): Promise<SpotifyStatus> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    setStatus("loading");
    try {
      const first = await fetchToken();
      if (first.status !== "ready" || !first.token) {
        setStatus(first.status);
        // Not a permanent failure — connecting an account later should be
        // able to retry, so the memoised promise is cleared.
        initPromise = null;
        return first.status;
      }

      await loadSdkScript();
      if (!window.Spotify) throw new Error("spotify sdk missing after load");

      player = new window.Spotify.Player({
        name: "Hypefy",
        getOAuthToken: (cb) => { void fetchToken().then((t) => t.token && cb(t.token)); },
        volume: 0.8,
      });

      player.addListener("ready", ((p: { device_id: string }) => {
        deviceId = p.device_id;
        setStatus("ready");
      }) as never);

      player.addListener("not_ready", (() => {
        deviceId = null;
        setStatus("failed");
      }) as never);

      // Spotify reports auth and account problems through these rather than
      // by rejecting connect(), so without them a Premium failure looks like
      // a player that simply never becomes ready.
      player.addListener("authentication_error", (() => setStatus("not_connected")) as never);
      player.addListener("account_error", (() => setStatus("not_premium")) as never);
      player.addListener("initialization_error", (() => setStatus("failed")) as never);

      const ok = await player.connect();
      if (!ok) { setStatus("failed"); initPromise = null; return "failed"; }
      return status;
    } catch {
      setStatus("failed");
      initPromise = null;
      return "failed";
    }
  })();

  return initPromise;
}

/** What the device's repeat mode was last set to, so it is only sent on a change. */
let repeatMode: "track" | "off" = "off";

/**
 * Play `uri` from `positionMs`, repeating the track if asked.
 *
 * Uses the Web API transfer-and-play endpoint because the SDK cannot start at
 * an offset, and a snippet is defined by exactly that.
 */
export async function spotifyPlay(
  uri: string,
  positionMs = 0,
  opts: { repeat?: boolean } = {},
): Promise<boolean> {
  if (status !== "ready" || !deviceId) {
    const s = await initSpotifyPlayer();
    if (s !== "ready" || !deviceId) return false;
  }
  const { token } = await fetchToken();
  if (!token) return false;

  // Browsers block audio until the page has had a real user gesture; the SDK
  // exposes this to opt its own <audio> element in.
  try { await player?.activateElement(); } catch { /* not always required */ }

  const res = await fetch(
    `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId!)}`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ uris: [uri], position_ms: Math.max(0, Math.round(positionMs)) }),
    },
  );
  const ok = res.ok || res.status === 204;

  // Repeat is a setting of the device, not of the play request: a Diary's
  // song goes round again (from the top — Spotify repeats whole tracks),
  // and anything else switches it back off. Only this app's own player is
  // touched, and only when the mode changes. A failure here just means the
  // song plays once.
  const want = opts.repeat ? "track" : "off";
  if (ok && want !== repeatMode) {
    const r = await fetch(
      `https://api.spotify.com/v1/me/player/repeat?state=${want}&device_id=${encodeURIComponent(deviceId!)}`,
      { method: "PUT", headers: { Authorization: `Bearer ${token}` } },
    ).catch(() => null);
    if (r && (r.ok || r.status === 204)) repeatMode = want;
  }
  return ok;
}

export async function spotifyPause() {
  try { await player?.pause(); } catch { /* nothing playing */ }
}

export function spotifyTeardown() {
  try { player?.disconnect(); } catch { /* already gone */ }
  player = null;
  deviceId = null;
  initPromise = null;
  setStatus("idle");
}
