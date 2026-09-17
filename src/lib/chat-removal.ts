"use client";

import { useSyncExternalStore } from "react";
import { scheduleUndoable } from "@/lib/undoable";
import type { ToastAction, ToastThumb } from "@/components/ui/ToastProvider";

/**
 * Deleting a chat, or leaving a group, with five seconds to take it back.
 *
 * The chat can be deleted from three places: the inbox, inside the thread,
 * and its info page. The last two go straight back to the inbox, which
 * renders from the server and would still list the chat, since the delete is
 * held for the undo window. So the chats waiting to go are kept here, outside
 * any one screen, and the inbox leaves them out until Undo or for good.
 */

const hidden = new Set<string>();
const listeners = new Set<() => void>();
let snapshot: ReadonlySet<string> = new Set();

function emit() {
  snapshot = new Set(hidden);
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Chats deleted on this visit, or waiting out their undo window. */
export function useRemovedChats(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);
}
const EMPTY: ReadonlySet<string> = new Set();

type Toast = (message: string, kind?: "success" | "error" | "plain", action?: ToastAction) => void;

export function removeChat({
  id,
  isGroup,
  name,
  thumb,
  leave,
  toast,
  onDone,
}: {
  id: string;
  isGroup: boolean;
  name: string;
  thumb?: ToastThumb;
  /** The real call: leave_conversation. */
  leave: () => PromiseLike<{ error: unknown }>;
  toast: Toast;
  /** After it has actually gone (a server refresh, say). */
  onDone?: () => void;
}) {
  hidden.add(id);
  emit();

  const cancel = scheduleUndoable(async () => {
    const { error } = await leave();
    if (error) {
      hidden.delete(id);
      emit();
      toast(isGroup ? "Couldn't leave that group." : "Couldn't delete that chat.", "error");
      return;
    }
    onDone?.();
  });

  toast(isGroup ? "Left group" : "Chat deleted", "plain", {
    label: "Undo",
    detail: isGroup ? name : `Chat with ${name}`,
    thumb: thumb ?? { name },
    onClick: () => {
      cancel();
      hidden.delete(id);
      emit();
    },
  });
}

/** Whether a chat is out of the inbox right now. */
export function isChatRemoved(id: string): boolean {
  return hidden.has(id);
}

/** For tests. */
export function resetRemovedChats() {
  hidden.clear();
  emit();
}
