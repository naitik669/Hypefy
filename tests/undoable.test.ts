import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  scheduleUndoable,
  flushUndoables,
  pendingUndoables,
  UNDO_MS,
} from "@/lib/undoable";

/**
 * Undo works by DEFERRING the delete rather than reversing it, because
 * nothing here can be reversed — posts and Shots are hard-deleted, and
 * unsend_message overwrites the body with null.
 *
 * That makes the timing the whole correctness story: a commit that runs
 * twice sends two deletes, and one that never runs leaves something the user
 * was told was gone.
 */
describe("scheduleUndoable", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    flushUndoables();
    vi.useRealTimers();
  });

  it("does not commit before the window is up", () => {
    const commit = vi.fn();
    scheduleUndoable(commit);
    vi.advanceTimersByTime(UNDO_MS - 1);
    expect(commit).not.toHaveBeenCalled();
  });

  it("commits once the window passes", () => {
    const commit = vi.fn();
    scheduleUndoable(commit);
    vi.advanceTimersByTime(UNDO_MS);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(pendingUndoables()).toBe(0);
  });

  it("never commits once cancelled", () => {
    const commit = vi.fn();
    const cancel = scheduleUndoable(commit);
    cancel();
    vi.advanceTimersByTime(UNDO_MS * 3);
    expect(commit).not.toHaveBeenCalled();
  });

  it("ignores a cancel that arrives after the commit", () => {
    // The undo button and the timer race by design — the button can be tapped
    // in the same tick the timer fires. Cancelling late must be a no-op, not
    // an error and not a second delete.
    const commit = vi.fn();
    const cancel = scheduleUndoable(commit);
    vi.advanceTimersByTime(UNDO_MS);
    expect(() => cancel()).not.toThrow();
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("ignores a second cancel", () => {
    const commit = vi.fn();
    const cancel = scheduleUndoable(commit);
    cancel();
    cancel();
    vi.advanceTimersByTime(UNDO_MS);
    expect(commit).not.toHaveBeenCalled();
  });

  it("flushes pending deletes immediately", () => {
    // Leaving the page inside the window must not silently drop the delete.
    // Being told something is deleted and finding it still there is worse
    // than having no undo at all.
    const a = vi.fn();
    const b = vi.fn();
    scheduleUndoable(a);
    scheduleUndoable(b);
    flushUndoables();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(pendingUndoables()).toBe(0);
  });

  it("does not send the same delete twice when a flush races the timer", () => {
    const commit = vi.fn();
    scheduleUndoable(commit);
    flushUndoables();
    vi.advanceTimersByTime(UNDO_MS * 2);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("keeps flushing after one commit throws", () => {
    const boom = vi.fn(() => {
      throw new Error("network");
    });
    const after = vi.fn();
    scheduleUndoable(boom);
    scheduleUndoable(after);
    expect(() => flushUndoables()).not.toThrow();
    expect(after).toHaveBeenCalledTimes(1);
  });

  it("cancels only its own delete", () => {
    const kept = vi.fn();
    const dropped = vi.fn();
    scheduleUndoable(kept);
    const cancel = scheduleUndoable(dropped);
    cancel();
    vi.advanceTimersByTime(UNDO_MS);
    expect(kept).toHaveBeenCalledTimes(1);
    expect(dropped).not.toHaveBeenCalled();
  });
});
