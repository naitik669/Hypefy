import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createChatActivityStore } from "@/lib/chat-activity";

/**
 * Who is typing, moved out of the thread's own state.
 *
 * A typing broadcast arrives on roughly every keystroke from every
 * other person in the chat, and RealChatView renders every message in
 * the conversation — so one person typing re-rendered the whole
 * thread, repeatedly, for as long as they kept typing. On a long
 * thread that is what made a chat stop responding.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const view = read("src/components/messages/RealChatView.tsx");
const indicator = read("src/components/messages/ChatActivity.tsx");

describe("the store", () => {
  it("adds and removes people", () => {
    const s = createChatActivityStore();
    expect(s.getSnapshot()).toEqual({ typing: [], recording: [] });

    s.add("typing", "a");
    s.add("typing", "b");
    expect(s.getSnapshot().typing).toEqual(["a", "b"]);

    s.remove("typing", "a");
    expect(s.getSnapshot().typing).toEqual(["b"]);
  });

  it("keeps the two kinds apart", () => {
    const s = createChatActivityStore();
    s.add("typing", "a");
    s.add("recording", "b");
    expect(s.getSnapshot()).toEqual({ typing: ["a"], recording: ["b"] });
  });

  it("returns the same snapshot object when nothing changed", () => {
    // useSyncExternalStore re-renders forever if getSnapshot returns a
    // fresh object each call, and the duplicate broadcast — the same
    // person still typing — is the common case, not the rare one.
    const s = createChatActivityStore();
    s.add("typing", "a");
    const first = s.getSnapshot();
    s.add("typing", "a");
    expect(s.getSnapshot()).toBe(first);

    s.remove("typing", "nobody");
    expect(s.getSnapshot()).toBe(first);
  });

  it("and tells nobody about either no-op", () => {
    // Asserting only the snapshot identity let a mutation through
    // that kept the object stable while still waking every listener.
    const s = createChatActivityStore();
    s.add("typing", "a");
    const listener = vi.fn();
    s.subscribe(listener);

    s.add("typing", "a");
    s.remove("typing", "nobody");
    s.remove("recording", "a");
    expect(listener).not.toHaveBeenCalled();
  });

  it("and a new one when it did", () => {
    const s = createChatActivityStore();
    const empty = s.getSnapshot();
    s.add("typing", "a");
    expect(s.getSnapshot()).not.toBe(empty);
  });

  it("tells subscribers only on a real change", () => {
    const s = createChatActivityStore();
    const listener = vi.fn();
    s.subscribe(listener);

    s.add("typing", "a");
    expect(listener).toHaveBeenCalledTimes(1);

    s.add("typing", "a");
    expect(listener).toHaveBeenCalledTimes(1);

    s.remove("typing", "a");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("and stops once unsubscribed", () => {
    const s = createChatActivityStore();
    const listener = vi.fn();
    const off = s.subscribe(listener);
    off();
    s.add("typing", "a");
    expect(listener).not.toHaveBeenCalled();
  });

  it("clear empties both, and is inert when already empty", () => {
    const s = createChatActivityStore();
    const listener = vi.fn();
    s.subscribe(listener);
    s.clear();
    expect(listener).not.toHaveBeenCalled();

    s.add("recording", "a");
    s.clear();
    expect(s.getSnapshot()).toEqual({ typing: [], recording: [] });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe("the thread no longer re-renders on a keystroke", () => {
  it("RealChatView holds no typing or recording state", () => {
    expect(view).not.toContain("setTypingIds");
    expect(view).not.toContain("setRecordingIds");
    expect(view).not.toContain("typingIds");
    expect(view).not.toContain("recordingIds");
  });

  it("the broadcasts write to the store instead", () => {
    expect(view).toContain('activity.add("typing", uid);');
    expect(view).toContain('activity.remove("typing", uid);');
    expect(view).toContain('activity.add("recording", p.userId!);');
  });

  it("one store per conversation, made once", () => {
    expect(view).toContain("const activity = useMemo(() => createChatActivityStore(), []);");
  });

  it("and the indicator subscribes rather than being handed props", () => {
    expect(indicator).toContain("useSyncExternalStore(");
    expect(indicator).toContain("store.subscribe");
    expect(indicator).toContain("store.getSnapshot");
  });

  it("the scroll nudge moved with the state it watched", () => {
    // Leaving it behind would have kept the dependency that caused
    // the re-render in the first place.
    expect(view).not.toContain("nearBottomRef.current) {\n      endRef.current?.scrollIntoView");
    expect(indicator).toContain("if (active && nearBottomRef.current)");
  });

  it("and the server snapshot is stable, so it can hydrate", () => {
    // useSyncExternalStore's third argument runs on the server; a new
    // object there is a hydration mismatch.
    expect(indicator).toContain("store.getSnapshot,\n    store.getSnapshot,");
  });
});
