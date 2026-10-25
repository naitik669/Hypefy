import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  MAX_ATTEMPTS,
  MAX_QUEUED,
  dropOutbox,
  isTerminal,
  outboxFor,
  queueOutbox,
  readOutbox,
  recordAttempt,
  toRestore,
  type OutboxEntry,
  type SentLike,
} from "@/lib/chat-outbox";

/**
 * A message that could not be sent, kept until it is.
 *
 * Until now an unsent message lived only in React state: write one in a
 * tunnel, switch apps, and it was gone with nothing to say it ever existed.
 * This is the part that survives, so the rest of the feature has something
 * to restore.
 *
 * The thing most worth guarding here is not the queue — it is what the queue
 * is allowed to write to the disk. A sealed conversation that spilled its
 * plaintext into localStorage on the way out would undo the whole point of
 * sealing it.
 */

const ME = "user-1";
const THEM = "user-2";

function entry(over: Partial<OutboxEntry> = {}): OutboxEntry {
  return {
    tempId: "temp-1",
    conversationId: "conv-1",
    kind: "text",
    wire: "hello",
    sealed: false,
    replyToId: null,
    createdAt: "2026-10-25T10:00:00.000Z",
    attempts: 0,
    ...over,
  };
}

/** Everything in storage, as one string, to search for things that leaked. */
function allStoredText(): string {
  const out: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k) out.push(k, localStorage.getItem(k) ?? "");
  }
  return out.join("\n");
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("what the outbox is allowed to write down", () => {
  it("stores the envelope of a sealed message, never the words", () => {
    // openEnvelope can open our own sent copy, so the envelope is enough to
    // redraw the bubble later. Keeping the plaintext would mean a sealed
    // chat wrote its contents to the disk in clear on the way out.
    queueOutbox(ME, entry({ wire: "e2ee:v1:AAAABBBBCCCC", sealed: true }));

    const stored = allStoredText();
    expect(stored).toContain("e2ee:v1:AAAABBBBCCCC");
    expect(stored).not.toContain("give me twenty mins");
    expect(readOutbox(ME)[0].sealed).toBe(true);
  });

  it("and retrying sends that same envelope rather than sealing again", () => {
    // Re-sealing at retry time would fail, or seal under a different key,
    // if the peer rotated theirs while the message sat here.
    queueOutbox(ME, entry({ wire: "e2ee:v1:ORIGINAL", sealed: true }));
    recordAttempt(ME, "temp-1");
    expect(readOutbox(ME)[0].wire).toBe("e2ee:v1:ORIGINAL");
  });
});

describe("surviving the app being killed", () => {
  it("what was queued is still there on the next read", () => {
    queueOutbox(ME, entry({ tempId: "temp-a" }));
    queueOutbox(ME, entry({ tempId: "temp-b", createdAt: "2026-10-25T10:01:00.000Z" }));
    expect(readOutbox(ME).map((e) => e.tempId)).toEqual(["temp-a", "temp-b"]);
  });

  it("oldest first, so the thread redraws them in the order they were written", () => {
    queueOutbox(ME, entry({ tempId: "late", createdAt: "2026-10-25T12:00:00.000Z" }));
    queueOutbox(ME, entry({ tempId: "early", createdAt: "2026-10-25T09:00:00.000Z" }));
    expect(readOutbox(ME).map((e) => e.tempId)).toEqual(["early", "late"]);
  });

  it("one account cannot see another's", () => {
    queueOutbox(ME, entry({ tempId: "mine" }));
    queueOutbox(THEM, entry({ tempId: "theirs" }));
    expect(readOutbox(ME).map((e) => e.tempId)).toEqual(["mine"]);
    expect(readOutbox(THEM).map((e) => e.tempId)).toEqual(["theirs"]);
  });

  it("and a thread only restores its own", () => {
    queueOutbox(ME, entry({ tempId: "here", conversationId: "conv-1" }));
    queueOutbox(ME, entry({ tempId: "elsewhere", conversationId: "conv-2" }));
    expect(outboxFor(ME, "conv-1").map((e) => e.tempId)).toEqual(["here"]);
  });
});

describe("giving up", () => {
  it("is not terminal before the attempts are spent", () => {
    for (let n = 0; n < MAX_ATTEMPTS; n++) {
      expect(isTerminal(entry({ attempts: n })), String(n)).toBe(false);
    }
  });

  it("is terminal once they are", () => {
    expect(isTerminal(entry({ attempts: MAX_ATTEMPTS }))).toBe(true);
    expect(isTerminal(entry({ attempts: MAX_ATTEMPTS + 1 }))).toBe(true);
  });

  it("each attempt is counted and kept, so a restart does not reset the budget", () => {
    // Counting in memory would mean an app that crashes on send retries for
    // ever and never reaches the state the thread draws as "Not sent".
    queueOutbox(ME, entry());
    recordAttempt(ME, "temp-1");
    recordAttempt(ME, "temp-1");
    expect(readOutbox(ME)[0].attempts).toBe(2);
  });

  it("an attempt on something already gone is not an error", () => {
    expect(() => recordAttempt(ME, "never-existed")).not.toThrow();
    expect(recordAttempt(ME, "never-existed")).toBeNull();
  });
});

describe("dropping one", () => {
  it("leaves the others alone", () => {
    queueOutbox(ME, entry({ tempId: "a" }));
    queueOutbox(ME, entry({ tempId: "b", createdAt: "2026-10-25T10:02:00.000Z" }));
    dropOutbox(ME, "a");
    expect(readOutbox(ME).map((e) => e.tempId)).toEqual(["b"]);
  });
});

describe("the queue cannot grow without bound", () => {
  it("keeps the newest and discards the oldest past the cap", () => {
    // A phone offline for a week should not fill its own disk, and
    // localStorage throwing on quota would take every draft with it.
    for (let i = 0; i < MAX_QUEUED + 5; i++) {
      queueOutbox(
        ME,
        entry({ tempId: `t-${i}`, createdAt: new Date(Date.UTC(2026, 9, 25, 0, i)).toISOString() }),
      );
    }
    const kept = readOutbox(ME);
    expect(kept.length).toBe(MAX_QUEUED);
    expect(kept.some((e) => e.tempId === "t-0")).toBe(false);
    expect(kept.some((e) => e.tempId === `t-${MAX_QUEUED + 4}`)).toBe(true);
  });
});

describe("a disk that will not cooperate", () => {
  it("a storage that throws does not take the send down with it", () => {
    // Private mode, blocked site data, a full disk. The message still has to
    // go; only the promise that it survives a restart is lost.
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => queueOutbox(ME, entry())).not.toThrow();
  });

  it("and a read that throws is an empty outbox, not a broken thread", () => {
    // Something has to be in there first, or the loop never reaches getItem
    // and the throwing stub is never touched — which is how the first
    // version of this test passed without exercising anything.
    localStorage.setItem(`hypefy_chat_outbox:${ME}:temp-1`, JSON.stringify(entry()));
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => readOutbox(ME)).not.toThrow();
    expect(readOutbox(ME)).toEqual([]);
  });

  it("a corrupt entry is discarded rather than thrown on", () => {
    // Half-written JSON from a kill mid-write must not make the thread
    // unopenable for ever.
    queueOutbox(ME, entry({ tempId: "good" }));
    localStorage.setItem("hypefy_chat_outbox:user-1:broken", "{not json");
    const kept = readOutbox(ME);
    expect(kept.map((e) => e.tempId)).toEqual(["good"]);
  });

  it("and so is one missing the fields the thread needs to draw it", () => {
    queueOutbox(ME, entry({ tempId: "good" }));
    localStorage.setItem("hypefy_chat_outbox:user-1:partial", JSON.stringify({ tempId: "partial" }));
    expect(readOutbox(ME).map((e) => e.tempId)).toEqual(["good"]);
  });
});

describe("deciding what to put back in the thread", () => {
  const sent = (over: Partial<SentLike> = {}): SentLike => ({
    sender_id: ME,
    body: "yeah give me twenty mins",
    created_at: "2026-10-25T10:00:30.000Z",
    ...over,
  });

  it("puts back only the ones that have given up", () => {
    // One still being retried is already drawn as pending by the thread it
    // belongs to. Restoring it as "Not sent" would be a lie about a message
    // that is still on its way.
    const entries = [
      entry({ tempId: "trying", attempts: 1 }),
      entry({ tempId: "dead", attempts: MAX_ATTEMPTS }),
    ];
    expect(toRestore(entries, [], ME).map((e) => e.tempId)).toEqual(["dead"]);
  });

  it("drops one that evidently arrived, rather than drawing it twice", () => {
    // The app can be killed in the gap between the server accepting a
    // message and the outbox row being dropped. The row survives, the
    // message is really in the thread, and without this the sender sees
    // their own message twice — once real, once marked Not sent.
    const e = entry({ tempId: "dead", attempts: MAX_ATTEMPTS, wire: "yeah give me twenty mins" });
    expect(toRestore([e], [sent()], ME)).toEqual([]);
  });

  it("but not one that merely resembles something else in the thread", () => {
    // Same words from the other person, or from a different time, is not
    // evidence that this one got through.
    const e = entry({ tempId: "dead", attempts: MAX_ATTEMPTS, wire: "ok" });
    expect(toRestore([e], [sent({ body: "ok", sender_id: "someone-else" })], ME).length).toBe(1);
    expect(toRestore([e], [sent({ body: "ok", created_at: "2026-10-25T18:00:00.000Z" })], ME).length).toBe(1);
    expect(toRestore([e], [sent({ body: "something else" })], ME).length).toBe(1);
  });

  it("and a sealed one is matched on its envelope, not on words it never stored", () => {
    // The plaintext is deliberately not kept, so the only thing there is to
    // compare is the envelope the server would have received.
    const e = entry({
      tempId: "dead",
      attempts: MAX_ATTEMPTS,
      wire: "e2ee:v1:ENVELOPE",
      sealed: true,
    });
    expect(toRestore([e], [sent({ body: "e2ee:v1:ENVELOPE" })], ME)).toEqual([]);
    expect(toRestore([e], [sent({ body: "e2ee:v1:DIFFERENT" })], ME).length).toBe(1);
  });

  it("a message with no body is never matched away by another of its kind", () => {
    // A OneShot carries no body by design: two of them would otherwise look
    // identical and the second would be silently dropped.
    const e = entry({ tempId: "dead", attempts: MAX_ATTEMPTS, kind: "oneshot", wire: null });
    expect(toRestore([e], [sent({ body: null })], ME).length).toBe(1);
  });

  it("oldest first, so they go back in the order they were written", () => {
    const entries = [
      entry({ tempId: "late", attempts: MAX_ATTEMPTS, createdAt: "2026-10-25T12:00:00.000Z" }),
      entry({ tempId: "early", attempts: MAX_ATTEMPTS, createdAt: "2026-10-25T09:00:00.000Z" }),
    ];
    expect(toRestore(entries, [], ME).map((e) => e.tempId)).toEqual(["early", "late"]);
  });
});
