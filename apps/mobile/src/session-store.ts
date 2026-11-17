import * as SecureStore from "expo-secure-store";
import {
  CHUNK_LIMIT,
  chunkKey,
  isCount,
  joinChunks,
  keysToRemove,
  splitValue,
} from "@hypefy/core/chunked-store";

/**
 * Where the Supabase session lives on a phone.
 *
 * The Keychain on iOS and the Keystore on Android, through
 * expo-secure-store — never AsyncStorage, which is a plain file any process
 * with the device unlocked can read. This holds a refresh token, which is a
 * durable credential.
 *
 * Async, unlike the Kv interface in @hypefy/core, and that is the reason
 * they are two things rather than one. Supabase's `auth.storage` option
 * accepts promises; the eleven device-local modules behind Kv do not,
 * because three of them return a stored value straight out of a synchronous
 * function. One interface for both would have had to be async and broken
 * those, or synchronous and unable to use the Keychain.
 *
 * The chunking is because secure-store warns above 2048 bytes per value and
 * a Google OAuth session is about 2.4KB — Supabase keeps the provider's own
 * tokens on it, and Google's access token alone is around 1.1KB. Written
 * whole it appears to work and then silently fails to persist, which
 * presents as the app signing that user out on every launch. The arithmetic
 * is in @hypefy/core/chunked-store with 24 tests on it; this file is the
 * three calls that bind it to the device.
 */

/** A key secure-store will accept: alphanumerics, dot, dash, underscore. */
function safeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, "_");
}

export const secureSessionStore = {
  async getItem(key: string): Promise<string | null> {
    const k = safeKey(key);
    const head = await SecureStore.getItemAsync(k);
    if (head === null) return null;

    // A value written by a build before chunking sits under the plain key as
    // the session JSON itself, which starts with "{". Returning it as-is is
    // what stops an update signing everyone out.
    if (!isCount(head)) return head;

    const count = Number(head);
    const parts = await Promise.all(
      Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(chunkKey(k, i))),
    );
    // All or nothing: a session rebuilt from three parts of four is invalid
    // JSON, and "there is nothing here" sends the reader to sign-in rather
    // than into a parse error.
    return joinChunks(parts);
  },

  async setItem(key: string, value: string): Promise<void> {
    const k = safeKey(key);
    const parts = splitValue(value, CHUNK_LIMIT);

    // Any parts a previous, longer value left behind. Written before the new
    // count so a crash cannot leave a count pointing past what exists.
    const previous = await SecureStore.getItemAsync(k);
    const previousCount = isCount(previous) ? Number(previous) : 0;
    for (let i = parts.length; i < previousCount; i++) {
      await SecureStore.deleteItemAsync(chunkKey(k, i));
    }

    for (let i = 0; i < parts.length; i++) {
      await SecureStore.setItemAsync(chunkKey(k, i), parts[i]);
    }
    // The count LAST, so it only ever names parts already on disk. An
    // interrupted write leaves the old count and the old parts, which is a
    // stale session rather than a corrupt one.
    await SecureStore.setItemAsync(k, String(parts.length));
  },

  async removeItem(key: string): Promise<void> {
    const k = safeKey(key);
    const head = await SecureStore.getItemAsync(k);
    const count = isCount(head) ? Number(head) : 0;
    // Parts first, count last — the reverse would leave orphaned parts with
    // nothing naming them, which nothing would ever clean up.
    for (const target of keysToRemove(k, count)) {
      await SecureStore.deleteItemAsync(target);
    }
  },
};
