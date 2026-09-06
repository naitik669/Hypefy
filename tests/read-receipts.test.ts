import { describe, it, expect } from "vitest";
import { everyoneHasRead, type Reader } from "@/components/messages/RealChatView";

const r = (over: Partial<Reader> & { userId: string }): Reader => ({
  lastReadAt: null,
  hideReadReceipts: false,
  ...over,
});

const SENT = "2026-09-06T10:00:00.000Z";
const BEFORE = "2026-09-06T09:00:00.000Z";
const AFTER = "2026-09-06T11:00:00.000Z";

/**
 * The "Seen" tick. Group chats could only ever show "sent" — the check was
 * gated on !isGroup, and the state behind it was a single scalar for the whole
 * conversation, so in a group any one member's read would have overwritten
 * everyone else's anyway.
 */
describe("everyoneHasRead", () => {
  it("a DM is seen once the other person has read past it", () => {
    expect(everyoneHasRead([r({ userId: "a", lastReadAt: AFTER })], SENT)).toBe(true);
    expect(everyoneHasRead([r({ userId: "a", lastReadAt: BEFORE })], SENT)).toBe(false);
    expect(everyoneHasRead([r({ userId: "a" })], SENT)).toBe(false);
  });

  it("reading at the exact send time counts", () => {
    expect(everyoneHasRead([r({ userId: "a", lastReadAt: SENT })], SENT)).toBe(true);
  });

  it("a group needs ALL of them, not just one", () => {
    const some = [
      r({ userId: "a", lastReadAt: AFTER }),
      r({ userId: "b", lastReadAt: AFTER }),
      r({ userId: "c", lastReadAt: BEFORE }),
    ];
    expect(everyoneHasRead(some, SENT)).toBe(false);

    const all = some.map((x) => ({ ...x, lastReadAt: AFTER }));
    expect(everyoneHasRead(all, SENT)).toBe(true);
  });

  it("one member hiding receipts does not withhold the tick from the rest", () => {
    // b's privacy setting is b's business; it must not mean a's read never
    // counts, or a single member could freeze the tick for the whole group.
    const readers = [
      r({ userId: "a", lastReadAt: AFTER }),
      r({ userId: "b", lastReadAt: null, hideReadReceipts: true }),
    ];
    expect(everyoneHasRead(readers, SENT)).toBe(true);
  });

  it("never seen when the only other person hides receipts", () => {
    expect(
      everyoneHasRead([r({ userId: "a", lastReadAt: AFTER, hideReadReceipts: true })], SENT),
    ).toBe(false);
  });

  it("never seen with nobody to read it", () => {
    // An empty group, or a conversation whose members failed to load: "sent"
    // is the honest answer, not "seen".
    expect(everyoneHasRead([], SENT)).toBe(false);
  });
});
