"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Chat photos, videos, documents and voice notes live in private buckets.
 *
 * Message bodies still hold the URL the file was uploaded under — that shape
 * is what every old row has, and rewriting them would touch every message
 * ever sent. It is no longer fetchable on its own. To show one, the app asks
 * storage for a short-lived signed link; storage answers only if the caller
 * uploaded the file or is a member of a conversation that contains it (see
 * `can_read_chat_media` in migration 0105).
 *
 * So a leaked link, a guessed address, or a link pasted into another chat
 * opens nothing for anyone who is not in the conversation, and stops working
 * an hour after it was issued for anyone who is.
 *
 * Speed is the cost of that, so most of this file is about not paying it
 * twice. A thread of fifty tiles would otherwise be fifty round trips before
 * the first picture; lookups that arrive together are sent as one call per
 * bucket, a link is reused until shortly before it dies, and links survive a
 * reload of the tab so reopening a chat is instant.
 */

type Bucket = "chat-media" | "voice-notes";

/** How long a signed link lives. */
const TTL_SECONDS = 60 * 60;
/** Re-sign this long before it actually expires, so a link never dies mid-play. */
const REFRESH_MARGIN_MS = 5 * 60_000;
/** How long to wait for more lookups before sending the batch. */
const BATCH_WINDOW_MS = 8;
/** Storage's own limit on paths per signing call is generous; stay well inside it. */
const MAX_PER_CALL = 100;
const STORE_KEY = "hypefy:chat-media-links:v1";

const PUBLIC_URL = /\/storage\/v1\/object\/public\/(chat-media|voice-notes)\/([^?#]+)/;

/** Where in storage a chat-media URL points, or null for anything else. */
export function parseChatMediaUrl(url: string): { bucket: Bucket; path: string } | null {
  const m = PUBLIC_URL.exec(url);
  if (!m) return null;
  try {
    return { bucket: m[1] as Bucket, path: decodeURIComponent(m[2]) };
  } catch {
    return null;
  }
}

/** Is this a URL that needs signing before it can be shown? */
export function needsSigning(url: string | null | undefined): boolean {
  return !!url && parseChatMediaUrl(url) !== null;
}

/** The slice of the storage client this needs. */
type Signer = {
  storage: {
    from: (bucket: string) => {
      createSignedUrls: (
        paths: string[],
        expiresIn: number,
      ) => Promise<{
        data: { path: string | null; signedUrl: string; error: string | null }[] | null;
        error: unknown;
      }>;
    };
  };
};

type Entry = { url: string; expiresAt: number };
const cache = new Map<string, Entry>();
let hydrated = false;

const keyOf = (bucket: string, path: string) => `${bucket}/${path}`;

function fresh(entry: Entry | undefined, now: number): entry is Entry {
  return !!entry && entry.expiresAt - REFRESH_MARGIN_MS > now;
}

// ── surviving a reload ─────────────────────────────────────────────────

/**
 * Links are kept in sessionStorage for the life of the tab.
 *
 * Not localStorage: a signed link is a bearer credential for an hour, and it
 * should not outlive the tab or be visible to another one. Everything here
 * tolerates storage being missing, full or throwing — the worst outcome is
 * signing again.
 */
function hydrate(now: number): void {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (!raw) return;
    const stored = JSON.parse(raw) as Record<string, Entry>;
    for (const [k, e] of Object.entries(stored)) {
      if (e && typeof e.url === "string" && fresh(e, now)) cache.set(k, e);
    }
  } catch {
    /* unreadable or absent — start empty */
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function persistSoon(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      const now = Date.now();
      const live: Record<string, Entry> = {};
      for (const [k, e] of cache) if (fresh(e, now)) live[k] = e;
      sessionStorage.setItem(STORE_KEY, JSON.stringify(live));
    } catch {
      /* full or unavailable — signing again is the fallback */
    }
  }, 250);
}

// ── batching ───────────────────────────────────────────────────────────

type Waiter = (url: string | null) => void;
const queue = new Map<Bucket, Map<string, Waiter[]>>();
const waiting = new Map<string, Promise<string | null>>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let queuedClient: Signer | null = null;

function enqueue(bucket: Bucket, path: string, client: Signer): Promise<string | null> {
  queuedClient = client;
  return new Promise((resolve) => {
    const forBucket = queue.get(bucket) ?? new Map<string, Waiter[]>();
    forBucket.set(path, [...(forBucket.get(path) ?? []), resolve]);
    queue.set(bucket, forBucket);
    flushTimer ??= setTimeout(() => void flush(), BATCH_WINDOW_MS);
  });
}

async function flush(): Promise<void> {
  flushTimer = null;
  const client = queuedClient;
  const batches = [...queue.entries()];
  queue.clear();
  if (!client) return;

  await Promise.all(
    batches.map(async ([bucket, byPath]) => {
      const paths = [...byPath.keys()];
      for (let i = 0; i < paths.length; i += MAX_PER_CALL) {
        await signChunk(client, bucket, paths.slice(i, i + MAX_PER_CALL), byPath);
      }
    }),
  );
}

async function signChunk(
  client: Signer,
  bucket: Bucket,
  paths: string[],
  byPath: Map<string, Waiter[]>,
): Promise<void> {
  const answers = new Map<string, string>();
  try {
    const { data, error } = await client.storage.from(bucket).createSignedUrls(paths, TTL_SECONDS);
    if (!error && data) {
      const issued = Date.now();
      for (const item of data) {
        // One refused file must not take its neighbours down with it: an
        // unsent message or a file from a chat we are not in fails alone.
        if (item.path && item.signedUrl && !item.error) {
          answers.set(item.path, item.signedUrl);
          cache.set(keyOf(bucket, item.path), { url: item.signedUrl, expiresAt: issued + TTL_SECONDS * 1000 });
        }
      }
      persistSoon();
    }
  } catch {
    /* every path in this chunk resolves to null below */
  }
  for (const path of paths) {
    const signed = answers.get(path) ?? null;
    for (const done of byPath.get(path) ?? []) done(signed);
  }
}

// ── public API ─────────────────────────────────────────────────────────

/** A signed link already held and still good — for rendering without a flash. */
export function peekSigned(url: string, now = Date.now()): string | null {
  const parsed = parseChatMediaUrl(url);
  if (!parsed) return url;
  hydrate(now);
  const held = cache.get(keyOf(parsed.bucket, parsed.path));
  return fresh(held, now) ? held.url : null;
}

/**
 * A URL that can be shown right now.
 *
 * Anything that is not a chat-media URL (a GIF, a local blob, an external
 * link) comes back untouched. A chat-media URL comes back signed, or null if
 * storage refused — not a member, unsent, offline — which the caller shows as
 * an empty tile rather than a broken image.
 *
 * Concurrent requests for one file share one lookup, lookups within a few
 * milliseconds of each other share one call, and a link is reused until
 * shortly before it expires.
 */
export async function resolveChatMediaUrl(
  url: string,
  opts: { force?: boolean; client?: Signer; now?: number } = {},
): Promise<string | null> {
  const parsed = parseChatMediaUrl(url);
  if (!parsed) return url;

  const now = opts.now ?? Date.now();
  hydrate(now);
  const key = keyOf(parsed.bucket, parsed.path);

  if (!opts.force) {
    const held = cache.get(key);
    if (fresh(held, now)) return held.url;
    const pending = waiting.get(key);
    if (pending) return pending;
  }

  const client = opts.client ?? (createClient() as unknown as Signer);
  const request = enqueue(parsed.bucket, parsed.path, client).finally(() => {
    if (waiting.get(key) === request) waiting.delete(key);
  });
  waiting.set(key, request);
  return request;
}

/** Forget every signed link — on sign-out, so the next account starts clean. */
export function clearChatMediaCache(): void {
  cache.clear();
  waiting.clear();
  queue.clear();
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  hydrated = true; // do not re-read what is about to be removed
  try {
    sessionStorage.removeItem(STORE_KEY);
  } catch {
    /* nothing stored, or nowhere to store it */
  }
}

/**
 * Every chat-media URL a message points at.
 *
 * Photos and videos hold the URL as their body; voice notes and documents
 * pack it into JSON alongside a duration or a name; an album holds several.
 * Never throws — a body that is not what its kind says is simply no URLs.
 */
export function mediaUrlsOf(kind: string, body: string | null | undefined): string[] {
  if (!body) return [];
  if (kind === "image" || kind === "video") return needsSigning(body) ? [body] : [];
  if (kind !== "voice" && kind !== "document" && kind !== "album") return [];
  try {
    const raw = JSON.parse(body) as { url?: unknown; items?: unknown };
    const found: unknown[] = Array.isArray(raw.items)
      ? raw.items.map((i) => (i as { url?: unknown } | null)?.url)
      : [raw.url];
    return found.filter((u): u is string => typeof u === "string" && needsSigning(u));
  } catch {
    return [];
  }
}

/**
 * Ask for links ahead of being drawn — a thread that has just loaded can
 * warm every tile in one call before the first one mounts.
 */
export function prefetchChatMedia(urls: (string | null | undefined)[]): void {
  for (const u of urls) if (u && needsSigning(u)) void resolveChatMediaUrl(u);
}

/**
 * The URL to put in `src`, and a callback for when it fails to load.
 *
 * `src` is undefined until a signed link is ready (draw an empty tile), and
 * the URL itself, unchanged and immediately, for anything that is not chat
 * media. `retry` re-signs once per URL — an expired link in a thread left
 * open for hours — and then gives up rather than looping.
 */
export function useChatMediaUrl(url: string | null | undefined): {
  src: string | undefined;
  retry: () => void;
} {
  const [signed, setSigned] = useState<{ for: string; url: string } | null>(null);
  const retried = useRef<string | null>(null);

  useEffect(() => {
    if (!url || !needsSigning(url) || peekSigned(url)) return;
    let live = true;
    void resolveChatMediaUrl(url).then((s) => {
      if (live && s) setSigned({ for: url, url: s });
    });
    return () => {
      live = false;
    };
  }, [url]);

  const retry = useCallback(() => {
    if (!url || !needsSigning(url) || retried.current === url) return;
    retried.current = url;
    void resolveChatMediaUrl(url, { force: true }).then((s) => {
      if (s) setSigned({ for: url, url: s });
    });
  }, [url]);

  if (!url) return { src: undefined, retry };
  if (!needsSigning(url)) return { src: url, retry };
  const held = peekSigned(url);
  if (held) return { src: held, retry };
  return { src: signed?.for === url ? signed.url : undefined, retry };
}
