import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { MAX_DRAFTS, deleteDraft, listDrafts, saveDraft, type CreationDraft } from "@/lib/creation-drafts";

/**
 * Drafts: a Shot or Show put down half-made, kept on the device. These are
 * the rules of the shelf they sit on.
 */

let n = 0;
function draft(over: Partial<CreationDraft> = {}): CreationDraft {
  n += 1;
  return {
    id: `d${n}`,
    userId: "me",
    mode: "shot",
    // The store only keeps it; a stand-in is as good as a real clip here.
    file: { name: `clip${n}.mp4` } as unknown as File,
    thumb: null,
    track: null,
    edit: { duration: 12, trim: { start: 1, end: 9 }, coverTime: 3 },
    caption: "",
    savedAt: n,
    ...over,
  };
}

beforeEach(async () => {
  for (const who of ["me", "them"]) {
    for (const d of await listDrafts(who)) await deleteDraft(d.id);
  }
});

describe("the drafts shelf", () => {
  it("keeps a draft whole, and hands back the newest first", async () => {
    const first = draft({ caption: "roof at dusk #golden" });
    const second = draft();
    expect(await saveDraft(first)).toBe("saved");
    expect(await saveDraft(second)).toBe("saved");

    const kept = await listDrafts("me");
    expect(kept.map((d) => d.id)).toEqual([second.id, first.id]);
    expect(kept[1].caption).toBe("roof at dusk #golden");
    expect(kept[1].edit).toEqual({ duration: 12, trim: { start: 1, end: 9 }, coverTime: 3 });
  });

  it("shows each person only their own, on a shared device", async () => {
    await saveDraft(draft());
    await saveDraft(draft({ userId: "them" }));
    expect(await listDrafts("me")).toHaveLength(1);
    expect(await listDrafts("them")).toHaveLength(1);
  });

  it("stops at the limit, without dropping one already kept", async () => {
    const kept: CreationDraft[] = [];
    for (let i = 0; i < MAX_DRAFTS; i++) {
      const d = draft();
      kept.push(d);
      expect(await saveDraft(d)).toBe("saved");
    }
    expect(await saveDraft(draft())).toBe("full");
    expect((await listDrafts("me")).map((d) => d.id).sort()).toEqual(kept.map((d) => d.id).sort());
    // Someone else's full shelf is not yours.
    expect(await saveDraft(draft({ userId: "them" }))).toBe("saved");
  });

  it("saves over a draft that is being worked on again, even at the limit", async () => {
    const kept: CreationDraft[] = [];
    for (let i = 0; i < MAX_DRAFTS; i++) {
      const d = draft();
      kept.push(d);
      await saveDraft(d);
    }
    expect(await saveDraft({ ...kept[0], caption: "second thoughts" })).toBe("saved");
    const now = await listDrafts("me");
    expect(now).toHaveLength(MAX_DRAFTS);
    expect(now.find((d) => d.id === kept[0].id)?.caption).toBe("second thoughts");
  });

  it("forgets a deleted draft, and only that one", async () => {
    const a = draft();
    const b = draft();
    await saveDraft(a);
    await saveDraft(b);
    await deleteDraft(a.id);
    expect((await listDrafts("me")).map((d) => d.id)).toEqual([b.id]);
  });
});
