"use client";

import { useMemo, useSyncExternalStore } from "react";

/**
 * What you had typed in a chat and not sent.
 *
 * Leaving a chat used to throw it away. It is kept now, per chat and per
 * account, and is waiting in the box when you come back; the chat's row in
 * Messages says "Draft:" and shows it, in place of the last message.
 *
 * Kept on the device: it is not a message, nobody else has any business with
 * it, and it should not cost a request per keystroke. It does not follow you
 * to another phone.
 */

const PREFIX = "hypefy_chat_draft:";
/** Long enough for anything someone would type into the box and walk away from. */
const MAX_DRAFT = 4000;
/** Told to this tab's lists when a draft changes; other tabs hear `storage`. */
const CHANGED = "hypefy:chat-drafts";

const keyFor = (userId: string, conversationId: string) => `${PREFIX}${userId}:${conversationId}`;

export function readDraft(userId: string, conversationId: string): string {
  if (!userId || typeof window === "undefined") return "";
  try {
    return localStorage.getItem(keyFor(userId, conversationId)) ?? "";
  } catch {
    return "";
  }
}

/** Keep what is in the box. Nothing but spaces is nothing: the draft is dropped. */
export function writeDraft(userId: string, conversationId: string, text: string) {
  if (!userId || typeof window === "undefined") return;
  try {
    const key = keyFor(userId, conversationId);
    const before = localStorage.getItem(key);
    const next = text.trim() ? text.slice(0, MAX_DRAFT) : null;
    if (next === before) return;
    if (next === null) localStorage.removeItem(key);
    else localStorage.setItem(key, next);
    window.dispatchEvent(new Event(CHANGED));
  } catch {
    /* private mode or a full disk: a draft is a kindness, not a promise */
  }
}

/** Every draft this account has on this device, as JSON: `{ [chatId]: text }`. */
function snapshot(userId: string): string {
  if (!userId || typeof window === "undefined") return "{}";
  try {
    const mine = `${PREFIX}${userId}:`;
    const out: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(mine)) continue;
      const text = localStorage.getItem(key);
      if (text && text.trim()) out[key.slice(mine.length)] = text;
    }
    return JSON.stringify(out);
  } catch {
    return "{}";
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * This account's drafts, by chat, kept current as they change.
 *
 * Read as a string and parsed, so a list is only redrawn when a draft has
 * actually changed. On the server there are none, which is also what the
 * first paint in the browser shows before the stored ones are read in.
 */
export function useChatDrafts(userId: string): Record<string, string> {
  const json = useSyncExternalStore(
    subscribe,
    () => snapshot(userId),
    () => "{}",
  );
  return useMemo(() => JSON.parse(json) as Record<string, string>, [json]);
}
