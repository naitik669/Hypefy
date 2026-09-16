"use client";

/**
 * Who a chat is with, known before the chat has loaded.
 *
 * The inbox row you tap already shows the name and picture, so the chat can
 * open with the same header straight away instead of a grey placeholder.
 * Kept per tab in sessionStorage, and in memory for the same page.
 */

export type ThreadHint = {
  name: string;
  hue: number;
  avatarUrl?: string | null;
  isGroup?: boolean;
  /** Groups: shown under the title. */
  memberCount?: number;
};

const KEY = "hypefy:thread-hints";
const MAX = 60;
let memory: Record<string, ThreadHint> | null = null;

function load(): Record<string, ThreadHint> {
  if (memory) return memory;
  try {
    memory = JSON.parse(sessionStorage.getItem(KEY) ?? "{}") as Record<string, ThreadHint>;
  } catch {
    memory = {};
  }
  return memory;
}

export function setThreadHint(id: string, hint: ThreadHint) {
  const all = load();
  delete all[id];
  all[id] = hint;
  const ids = Object.keys(all);
  for (const old of ids.slice(0, Math.max(0, ids.length - MAX))) delete all[old];
  try {
    sessionStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* memory still has it */
  }
}

export function getThreadHint(id: string): ThreadHint | null {
  return load()[id] ?? null;
}
