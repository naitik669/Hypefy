/**
 * Who is typing or recording in a chat, kept outside React state.
 *
 * These two lists change constantly — a typing broadcast arrives on
 * roughly every keystroke from every other person in the thread, and
 * each one used to be a `setState` in RealChatView. That component
 * renders every message in the conversation, so one person typing
 * re-rendered the whole thread, over and over, for as long as they
 * kept typing. On a long thread that is what made a chat stop
 * responding.
 *
 * A store solves it by changing who re-renders: the writers push here
 * and nothing happens to the chat, while the one small component that
 * draws the indicator subscribes and re-renders alone. It is the
 * `useSyncExternalStore` shape rather than a context because a
 * context value changing would re-render every consumer under the
 * provider, which is the problem we started with.
 *
 * One store per conversation, created by the view and handed down, so
 * nothing leaks between threads.
 */

export type ActivityKind = "typing" | "recording";

export type ActivitySnapshot = {
  typing: readonly string[];
  recording: readonly string[];
};

const EMPTY: ActivitySnapshot = { typing: [], recording: [] };

export type ChatActivityStore = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => ActivitySnapshot;
  add: (kind: ActivityKind, userId: string) => void;
  remove: (kind: ActivityKind, userId: string) => void;
  clear: () => void;
};

export function createChatActivityStore(): ChatActivityStore {
  let snapshot: ActivitySnapshot = EMPTY;
  const listeners = new Set<() => void>();

  function emit() {
    for (const l of listeners) l();
  }

  /**
   * Replace one list and tell everybody.
   *
   * There is no "did it actually change?" guard here on purpose: both
   * callers below already return early when nothing would change, so
   * a guard in here could never fire. The property it would protect —
   * getSnapshot returning a stable reference for an unchanged store,
   * without which useSyncExternalStore re-renders forever — is real
   * and tested; it is just enforced at the two doors rather than
   * again in the corridor.
   */
  function set(kind: ActivityKind, next: readonly string[]) {
    snapshot = { ...snapshot, [kind]: next };
    emit();
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    add(kind, userId) {
      const current = snapshot[kind];
      if (current.includes(userId)) return;
      set(kind, [...current, userId]);
    },
    remove(kind, userId) {
      const current = snapshot[kind];
      if (!current.includes(userId)) return;
      set(
        kind,
        current.filter((id) => id !== userId),
      );
    },
    clear() {
      if (snapshot === EMPTY) return;
      snapshot = EMPTY;
      emit();
    },
  };
}

/** The server has nobody typing, and must not allocate a new object each call. */
export function emptyActivity(): ActivitySnapshot {
  return EMPTY;
}
