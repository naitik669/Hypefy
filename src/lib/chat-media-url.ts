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
 */

type Bucket = "chat-media" | "voice-notes";

/** How long a signed link lives. */
const TTL_SECONDS = 60 * 60;
/** Re-sign this long before it actually expires, so a link never dies mid-play. */
const REFRESH_MARGIN_MS = 5 * 60_000;

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
      createSignedUrl: (
        path: string,
        expiresIn: number,
      ) => Promise<{ data: { signedUrl: string } | null; error: unknown }>;
    };
  };
};

type Entry = { url: string; expiresAt: number };
const cache = new Map<string, Entry>();
const inFlight = new Map<string, Promise<string | null>>();

function fresh(entry: Entry | undefined, now: number): entry is Entry {
  return !!entry && entry.expiresAt - REFRESH_MARGIN_MS > now;
}

/** A signed link already held and still good — for rendering without a flash. */
export function peekSigned(url: string, now = Date.now()): string | null {
  const parsed = parseChatMediaUrl(url);
  if (!parsed) return url;
  const held = cache.get(`${parsed.bucket}/${parsed.path}`);
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
 * Concurrent requests for one file share one round trip, and a link is
 * reused until shortly before it expires.
 */
export async function resolveChatMediaUrl(
  url: string,
  opts: { force?: boolean; client?: Signer; now?: number } = {},
): Promise<string | null> {
  const parsed = parseChatMediaUrl(url);
  if (!parsed) return url;

  const key = `${parsed.bucket}/${parsed.path}`;
  const now = opts.now ?? Date.now();
  const held = cache.get(key);
  if (!opts.force && fresh(held, now)) return held.url;

  const pending = inFlight.get(key);
  if (pending && !opts.force) return pending;

  const client = opts.client ?? (createClient() as unknown as Signer);
  const request = (async () => {
    try {
      const { data, error } = await client.storage
        .from(parsed.bucket)
        .createSignedUrl(parsed.path, TTL_SECONDS);
      if (error || !data?.signedUrl) return null;
      cache.set(key, { url: data.signedUrl, expiresAt: now + TTL_SECONDS * 1000 });
      return data.signedUrl;
    } catch {
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, request);
  return request;
}

/** Forget every signed link — on sign-out, so the next account starts clean. */
export function clearChatMediaCache(): void {
  cache.clear();
  inFlight.clear();
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
