import { describe, it, expect } from "vitest";
import { threadOf } from "@/components/feed/CommentsSheet";

type Node = Parameters<typeof threadOf>[0][number];

function node(id: string, parent: string | null = null): Node {
  return {
    id,
    user_id: "u1",
    body: id,
    image_url: null,
    created_at: "2026-01-01T00:00:00Z",
    parent_id: parent,
    hyped: false,
    hypeCount: 0,
    reported: false,
    profiles: null,
  };
}

/**
 * The flat-to-threads step. Flat state is what lets one hype re-render one
 * row instead of the whole thread, so this is the piece holding that up.
 */
describe("threadOf", () => {
  it("keeps roots in the order they were posted", () => {
    const t = threadOf([node("a"), node("b"), node("c")]);
    expect(t.map((x) => x.root.id)).toEqual(["a", "b", "c"]);
  });

  it("hangs replies off their parent", () => {
    const t = threadOf([node("a"), node("r1", "a"), node("b"), node("r2", "a")]);
    expect(t.map((x) => x.root.id)).toEqual(["a", "b"]);
    expect(t[0].replies.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(t[1].replies).toEqual([]);
  });

  it("promotes a reply whose parent is gone rather than dropping it", () => {
    // Deleting a parent removes its children here, but a reply can also
    // arrive with a parent that was never loaded. Silently discarding it
    // would read as data loss.
    const t = threadOf([node("orphan", "missing")]);
    expect(t.map((x) => x.root.id)).toEqual(["orphan"]);
  });

  it("does not nest replies under replies", () => {
    // The UI is one level deep. A reply-to-a-reply belongs to the same
    // thread, not to an invisible third tier.
    const t = threadOf([node("a"), node("r1", "a"), node("r2", "r1")]);
    expect(t).toHaveLength(1);
    expect(t[0].replies.map((r) => r.id)).toEqual(["r1", "r2"]);
  });

  it("handles an empty thread", () => {
    expect(threadOf([])).toEqual([]);
  });
});
