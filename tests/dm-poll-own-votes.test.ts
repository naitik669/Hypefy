import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { readMyChoices } from "@hypefy/core/chat-poll-votes";

/**
 * Your ticks on a poll are your own votes, not the conversation's.
 *
 * The defect, 26 Nov: PollBubble read message_poll_votes filtered by message
 * only. RLS lets every member read every member's votes (0174, on purpose:
 * a group can see who is in for Friday), so the read came back with the
 * whole conversation's choices and ticked all of them as yours.
 *
 * The fake below applies every .eq it is given to a table holding several
 * people's votes, the way PostgREST would under that policy, so the test
 * asks the reader for its answer rather than checking which calls it made.
 */

type Vote = { message_id: string; user_id: string; choice: number };

function fakeDb(votes: Vote[], error: { message: string } | null = null) {
  return {
    from(table: string) {
      if (table !== "message_poll_votes") throw new Error(`unexpected table ${table}`);
      const filters: [string, unknown][] = [];
      const builder = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          filters.push([col, val]);
          return builder;
        },
        then: (resolve: (r: { data: unknown; error: unknown }) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(
            error
              ? { data: null, error }
              : {
                  data: votes
                    .filter((v) => filters.every(([c, x]) => (v as Record<string, unknown>)[c] === x))
                    .map((v) => ({ choice: v.choice })),
                  error: null,
                },
          ).then(resolve, reject),
      };
      return builder;
    },
  } as unknown as Parameters<typeof readMyChoices>[0];
}

const POLL = "poll-1";
const OTHER_POLL = "poll-2";
const ME = "me";

// A group of three on one poll, plus a vote of mine on a different poll.
const VOTES: Vote[] = [
  { message_id: POLL, user_id: ME, choice: 0 },
  { message_id: POLL, user_id: "ana", choice: 1 },
  { message_id: POLL, user_id: "ravi", choice: 2 },
  { message_id: POLL, user_id: "ravi", choice: 0 },
  { message_id: OTHER_POLL, user_id: ME, choice: 3 },
];

describe("your ticks on a poll", () => {
  it("are only the options you chose, in a group where others chose differently", async () => {
    expect([...(await readMyChoices(fakeDb(VOTES), POLL, ME))]).toEqual([0]);
  });

  it("are empty when you have not voted, however many others have", async () => {
    expect((await readMyChoices(fakeDb(VOTES), POLL, "ana-not-voted")).size).toBe(0);
  });

  it("do not pick up your votes on another poll", async () => {
    expect([...(await readMyChoices(fakeDb(VOTES), OTHER_POLL, ME))]).toEqual([3]);
  });

  it("a refused read is an error, not a poll you have not voted on", async () => {
    await expect(readMyChoices(fakeDb(VOTES, { message: "permission denied" }), POLL, ME)).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("the bubble asks for the viewer's own votes", () => {
  // JSX and effects are not run here, so this one is read: comments and
  // imports stripped first, so a mention of the call cannot satisfy it.
  const code = (p: string) =>
    readFileSync(p, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1")
      .replace(/^import[\s\S]*?;$/gm, "");

  it("PollBubble passes who is looking, and reports a failed read", () => {
    const src = code("src/components/messages/PollBubble.tsx");
    expect(src.match(/readMyChoices\(/g)?.length).toBe(1);
    expect(src).toMatch(/readMyChoices\(supabase, messageId, viewerId\)/);
    expect(src).toMatch(/\.catch\(\(e[^)]*\) =>[\s\S]{0,120}onError\(/);
  });

  it("and the thread hands it the signed-in user", () => {
    const src = code("src/components/messages/RealChatView.tsx");
    const bubbles = src.match(/<PollBubble[\s\S]*?\/>/g) ?? [];
    expect(bubbles.length).toBe(1);
    expect(bubbles[0]).toMatch(/viewerId=\{currentUserId\}/);
  });
});
