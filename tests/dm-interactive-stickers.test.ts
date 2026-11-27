import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  answeredLabel,
  countdownReady,
  percents,
  promptReady,
  quizReady,
  readChatSticker,
  rulePromise,
  sliderScore,
  whoSees,
} from "@hypefy/core/chat-stickers";
import { isMissingFunction, readMyStickerAnswer, readStickerResults } from "@hypefy/core/chat-sticker-answers";

/**
 * Interactive stickers in a conversation (0221), and one rule for who sees
 * an answer: counts for everyone, names only for whoever asked.
 *
 * The SQL itself is exercised against a real Postgres by
 * supabase/checks/0221_dm_interactive_stickers — every guarantee below that
 * is read from the migration's text was also run there, and mutated there.
 * This file is what CI can run.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
/** SQL with its comments gone, so a guarantee cannot be met by a comment. */
const sql = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
/** TS/TSX with comments and imports gone. */
const code = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/^import[\s\S]*?;$/gm, "");

const msg = (kind: string, body: string | null, metadata: unknown, extra: Record<string, unknown> = {}) => ({
  kind,
  body,
  metadata,
  ...extra,
});

describe("reading an interactive sticker off a message", () => {
  it("reads each of the four kinds", () => {
    expect(
      readChatSticker(msg("quiz", "Which DB?", { sticker: "quiz", options: ["Vercel", "Supabase"], answer: 1, tally: [1, 3], voters: 4 })),
    ).toEqual({ kind: "quiz", question: "Which DB?", options: ["Vercel", "Supabase"], answer: 1, tally: [1, 3], voters: 4 });
    expect(readChatSticker(msg("slider", "How hyped?", { sticker: "slider", avg: 80, count: 2 }))).toEqual({
      kind: "slider",
      prompt: "How hyped?",
      avg: 80,
      count: 2,
    });
    expect(readChatSticker(msg("question", "What first?", { sticker: "question", count: 3 }))).toEqual({
      kind: "question",
      prompt: "What first?",
      count: 3,
    });
    expect(readChatSticker(msg("countdown", "Launch", { sticker: "countdown", at: "2026-12-01T10:00:00Z" }))).toEqual({
      kind: "countdown",
      title: "Launch",
      at: "2026-12-01T10:00:00.000Z",
    });
  });

  it("a forwarded copy is not a sticker: send_message keeps the kind but not the metadata", () => {
    // This is the shape ForwardSheet produces. Drawn as a card it would be a
    // quiz with no options, or a slider whose answers 0221 refuses.
    expect(readChatSticker(msg("quiz", "Which DB?", { forwarded: true }))).toBe(null);
    expect(readChatSticker(msg("slider", "How hyped?", { forwarded: true }))).toBe(null);
    // And a kind that names a different sticker than the metadata does.
    expect(readChatSticker(msg("slider", "How hyped?", { sticker: "question", count: 1 }))).toBe(null);
  });

  it("an unsent sticker, an empty one, or a poll is not one of these", () => {
    expect(readChatSticker(msg("slider", "How hyped?", { sticker: "slider" }, { is_unsent: true }))).toBe(null);
    expect(readChatSticker(msg("slider", "  ", { sticker: "slider" }))).toBe(null);
    expect(readChatSticker(msg("poll", "Where?", { sticker: "poll", options: ["a", "b"] }))).toBe(null);
    expect(readChatSticker(msg("text", "hi", null))).toBe(null);
  });

  it("a quiz whose right answer cannot be trusted is not drawn", () => {
    const quiz = (meta: Record<string, unknown>) =>
      readChatSticker(msg("quiz", "Q", { sticker: "quiz", options: ["A", "B", "C"], answer: 0, ...meta }));
    expect(quiz({ answer: 3 })).toBe(null);
    expect(quiz({ answer: -1 })).toBe(null);
    expect(quiz({ answer: 1.5 })).toBe(null);
    // One unreadable option would shift the rest under the stored index.
    expect(quiz({ options: ["A", 7, "C"] })).toBe(null);
    expect(quiz({ options: ["A"] })).toBe(null);
    // A short tally reads as zeros rather than a bar with no number.
    expect(quiz({ tally: [2] })).toMatchObject({ tally: [2, 0, 0] });
  });

  it("a countdown with no readable time is not drawn", () => {
    expect(readChatSticker(msg("countdown", "Launch", { sticker: "countdown", at: "soon" }))).toBe(null);
    expect(readChatSticker(msg("countdown", "Launch", { sticker: "countdown" }))).toBe(null);
  });
});

describe("the line on every card: who sees your answer", () => {
  it("someone else's sticker names the asker as the only one who sees names", () => {
    expect(whoSees("poll", "Anup")).toBe("Only Anup, who asked, sees who voted");
    expect(whoSees("quiz", "Anup")).toBe("Only Anup, who asked, sees who answered");
    expect(whoSees("slider", "AMAN")).toBe("Only AMAN, who asked, sees who moved it");
    expect(whoSees("question", "AMAN")).toBe("Only AMAN sees your answer");
  });

  it("your own sticker says you see the names", () => {
    expect(whoSees("poll", null)).toBe("You asked, so you see the names");
    expect(whoSees("quiz", null)).toBe("You asked, so you see the names");
    expect(whoSees("slider", null)).toBe("You asked, so you see the names");
    expect(whoSees("question", null)).toBe("You asked, so you see the answers");
  });

  it("a countdown has nothing to see, whoever is looking", () => {
    expect(whoSees("countdown", "Anup")).toBe(whoSees("countdown", null));
    expect(whoSees("countdown", null)).toMatch(/no votes/);
  });

  it("the composer promises the same rule before sending", () => {
    expect(rulePromise("poll")).toBe("Everyone sees the counts. Only you see who.");
    expect(rulePromise("question")).toBe("Only you will see their answers.");
    expect(rulePromise("countdown")).toMatch(/no answers/);
  });
});

describe("the counts", () => {
  it("a poll counts everyone, since the asker votes in their own", () => {
    expect(answeredLabel("poll", 5, 6)).toBe("5 of 6 answered");
  });

  it("the rest count everyone but the asker, whose answer 0221 refuses", () => {
    expect(answeredLabel("quiz", 4, 6)).toBe("4 of 5 answered");
    expect(answeredLabel("slider", 1, 2)).toBe("Answered");
    expect(answeredLabel("question", 0, 2)).toBe("Not answered yet");
  });

  it("never more answered than can answer, never negative", () => {
    // Somebody who answered and then left the group is still in the count.
    expect(answeredLabel("quiz", 9, 6)).toBe("5 of 5 answered");
    expect(answeredLabel("poll", -1, 6)).toBe("0 of 6 answered");
  });

  it("percentages are of the people who answered", () => {
    expect(percents([1, 3], 4)).toEqual([25, 75]);
    expect(percents([0, 0], 0)).toEqual([0, 0]);
  });

  it("the slider's 0–100 reads as one to five", () => {
    expect(sliderScore(0)).toBe("1.0");
    expect(sliderScore(80)).toBe("4.2");
    expect(sliderScore(100)).toBe("5.0");
    expect(sliderScore(140)).toBe("5.0");
  });
});

describe("the composer cannot offer what the server refuses", () => {
  it("a quiz needs distinct answers and one marked right", () => {
    expect(quizReady("Which?", ["Vercel", "Supabase"], 1)).toBe(true);
    expect(quizReady("Which?", ["Vercel", "Supabase"], null)).toBe(false);
    expect(quizReady("Which?", ["Vercel", "Supabase"], 2)).toBe(false);
    // send_dm_sticker refuses a repeat rather than dropping it, because the
    // answer is an index — so the button must refuse it too.
    expect(quizReady("Which?", ["Vercel", " vercel "], 0)).toBe(false);
    expect(quizReady("Which?", ["Vercel", ""], 0)).toBe(false);
    expect(quizReady("Which?", ["A"], 0)).toBe(false);
    expect(quizReady("  ", ["A", "B"], 0)).toBe(false);
  });

  it("a countdown is for a time still to come, within a year", () => {
    const now = Date.parse("2026-11-27T06:00:00Z");
    expect(countdownReady("Launch", "2026-12-01T10:00:00Z", now)).toBe(true);
    expect(countdownReady("Launch", "2026-11-27T05:59:00Z", now)).toBe(false);
    expect(countdownReady("Launch", "2028-01-01T00:00:00Z", now)).toBe(false);
    expect(countdownReady("", "2026-12-01T10:00:00Z", now)).toBe(false);
    expect(countdownReady("x".repeat(61), "2026-12-01T10:00:00Z", now)).toBe(false);
  });

  it("a slider or a question needs a prompt", () => {
    expect(promptReady("How hyped?")).toBe(true);
    expect(promptReady("   ")).toBe(false);
    expect(promptReady("q".repeat(201))).toBe(false);
  });
});

// ── The reads ───────────────────────────────────────────────────────────

type Answer = { message_id: string; user_id: string; value: number | null; body: string | null };

/** Applies every .eq to a table holding several people's rows, as PostgREST would under a wide policy. */
function fakeDb(answers: Answer[], rpc: { data: unknown; error: unknown } = { data: [], error: null }) {
  return {
    from(table: string) {
      if (table !== "message_sticker_answers") throw new Error(`unexpected table ${table}`);
      const filters: [string, unknown][] = [];
      const builder = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          filters.push([col, val]);
          return builder;
        },
        then: (resolve: (r: unknown) => unknown) =>
          Promise.resolve({
            data: answers
              .filter((a) => filters.every(([c, x]) => (a as Record<string, unknown>)[c] === x))
              .map((a) => ({ value: a.value, body: a.body })),
            error: null,
          }).then(resolve),
      };
      return builder;
    },
    rpc: (fn: string) => {
      if (fn !== "dm_sticker_results") throw new Error(`unexpected rpc ${fn}`);
      return Promise.resolve(rpc);
    },
  } as unknown as Parameters<typeof readMyStickerAnswer>[0];
}

describe("your own answer", () => {
  const rows: Answer[] = [
    { message_id: "s1", user_id: "ana", value: 90, body: null },
    { message_id: "s1", user_id: "me", value: 20, body: null },
    { message_id: "s2", user_id: "me", value: null, body: "frames" },
  ];

  it("is yours, in a chat where others answered too", async () => {
    expect(await readMyStickerAnswer(fakeDb(rows), "s1", "me")).toEqual({ value: 20, body: null });
  });

  it("is nothing when you have not answered, however many others have", async () => {
    expect(await readMyStickerAnswer(fakeDb(rows), "s1", "ravi")).toBe(null);
  });
});

describe("the asker's results", () => {
  it("are read from dm_sticker_results and named", async () => {
    const got = await readStickerResults(
      fakeDb([], {
        data: [
          { user_id: "a", username: "anup", display_name: "Anup", avatar_url: null, avatar_hue: 330, choices: [0], value: null, body: null },
          { user_id: "b", username: "lavi", display_name: " ", avatar_url: null, avatar_hue: null, choices: null, value: 40, body: null },
        ],
        error: null,
      }),
      "m",
    );
    expect(got).toEqual([
      { userId: "a", name: "Anup", username: "anup", avatarUrl: null, hue: 330, choices: [0], value: null, body: null },
      { userId: "b", name: "lavi", username: "lavi", avatarUrl: null, hue: 0, choices: [], value: 40, body: null },
    ]);
  });

  it("before 0221 is run the sheet is told so, rather than shown nobody", async () => {
    expect(await readStickerResults(fakeDb([], { data: null, error: { code: "PGRST202", message: "x" } }), "m")).toBe(
      "unavailable",
    );
    expect(isMissingFunction({ code: "42883" })).toBe(true);
    expect(isMissingFunction({ code: "42501" })).toBe(false);
  });

  it("a refused read throws: an empty sheet would say nobody answered", async () => {
    await expect(
      readStickerResults(fakeDb([], { data: null, error: { code: "42501", message: "permission denied" } }), "m"),
    ).rejects.toThrow(/permission denied/);
  });
});

// ── The migration ───────────────────────────────────────────────────────

describe("0221: names only for whoever asked", () => {
  const m = sql("supabase/migrations/0221_dm_interactive_stickers.sql");

  it("takes away 0174's read of every member's poll votes, and leaves your own", () => {
    expect(m).toContain("drop policy if exists poll_votes_read on public.message_poll_votes;");
    const own = m.match(/create policy poll_votes_read_own on public\.message_poll_votes\s+for select using \(([^;]*)\);/);
    expect(own?.[1]).toBe("user_id = (select auth.uid())");
    // The only policies on the votes table are these.
    expect(m.match(/create policy \w+ on public\.message_poll_votes/g)).toEqual([
      "create policy poll_votes_read_own on public.message_poll_votes",
    ]);
  });

  it("slider values and question answers are readable only by who wrote them, and writable by nobody", () => {
    const own = m.match(/create policy sticker_answers_read_own on public\.message_sticker_answers\s+for select using \(([^;]*)\);/);
    expect(own?.[1]).toBe("user_id = (select auth.uid())");
    expect(m).toContain("revoke all on table public.message_sticker_answers from anon, authenticated;");
    expect(m).not.toMatch(/grant (insert|update|delete|all)[^;]*message_sticker_answers/);
  });

  it("the names come through one function, for the sender of the message, while still a member", () => {
    const fn = m.slice(m.indexOf("create or replace function public.dm_sticker_results"));
    const target = fn.slice(fn.indexOf("with target as"), fn.indexOf("), answers as"));
    expect(target).toContain("and m.sender_id = (select auth.uid())");
    expect(target).toContain("and public.is_conv_member(m.conversation_id)");
    expect(target).toContain("and not m.is_unsent and m.removed_at is null");
  });

  it("an answer is to a real sticker of that kind, by a member, not the asker", () => {
    const fn = m.slice(m.indexOf("create or replace function public.dm_sticker_target"), m.indexOf("revoke all on function public.dm_sticker_target"));
    expect(fn).toContain("m.kind = p_kind and m.metadata ->> 'sticker' = p_kind");
    expect(fn).toContain("if not public.is_conv_member(v_msg.conversation_id) then raise exception");
    expect(fn).toContain("if v_msg.sender_id = (select auth.uid()) then raise exception");
    // Each answering function goes through it, with its own kind.
    expect(m).toContain("v_msg := public.dm_sticker_target(p_message_id, 'quiz');");
    expect(m).toContain("perform public.dm_sticker_target(p_message_id, 'slider');");
    expect(m).toContain("perform public.dm_sticker_target(p_message_id, 'question');");
    // And nobody calls it directly.
    expect(m).toContain("revoke all on function public.dm_sticker_target(uuid, text) from public, anon, authenticated;");
  });

  it("a quiz answer is final", () => {
    const fn = m.slice(m.indexOf("create or replace function public.answer_dm_quiz"), m.indexOf("revoke all on function public.answer_dm_quiz"));
    expect(fn).toMatch(/if not exists \(select 1 from public\.message_poll_votes where message_id = p_message_id and user_id = v_me\) then\s+perform public\.rate_limit[^;]*;\s+insert into public\.message_poll_votes/);
    expect(fn).not.toContain("delete from public.message_poll_votes");
  });

  it("the counts are recomputed onto the message, where the thread already listens", () => {
    expect(m).toContain("set metadata = metadata || jsonb_build_object('tally', v_tally, 'voters', v_voters)");
    expect(m).toContain("set metadata = metadata || jsonb_build_object('avg', v_avg, 'count', v_n)");
    expect(m).toContain("set metadata = metadata || jsonb_build_object('count', v_n)");
  });

  it("send_message is left alone", () => {
    expect(m).not.toContain("function public.send_message");
  });

  it("blocking holds for these as for messages", () => {
    const fn = m.slice(m.indexOf("create or replace function public.send_dm_sticker"), m.indexOf("revoke all on function public.send_dm_sticker"));
    expect(fn).toContain("join public.blocked_users b on b.blocker_id = cm.user_id and b.blocked_id = v_me");
  });
});

describe("in the thread", () => {
  const chat = code("src/components/messages/RealChatView.tsx");

  it("draws the card only when the message really is one", () => {
    expect(chat).toContain(") : readChatSticker(m) ? (");
    expect(chat).toContain("sticker={readChatSticker(m)!}");
  });

  it("every card is told who asked and how many could answer", () => {
    const cards = chat.match(/<(PollBubble|ChatStickerCard)[\s\S]*?\/>/g) ?? [];
    expect(cards.length).toBe(2);
    for (const c of cards) {
      expect(c).toContain("viewerId={currentUserId}");
      expect(c).toContain("askerName={isGroup ? senderName(m.sender_id) : peerName}");
      expect(c).toContain("memberCount={isGroup ? group!.memberCount : 2}");
    }
  });

  it("sends through send_dm_sticker", () => {
    const fn = chat.slice(chat.indexOf("async function sendInteractive"), chat.indexOf("async function retrySend"));
    expect(fn).toContain('supabase.rpc("send_dm_sticker"');
    expect(fn).toContain("p_kind: draft.kind");
  });

  it("every card carries the rule line, and only the asker's opens the names", () => {
    const face = code("src/components/messages/ChatStickers.tsx");
    const shell = face.slice(face.indexOf("export function StickerFace"), face.indexOf("export function ChatStickerCard"));
    expect(shell).toContain("const rule = whoSees(kind, mine ? null : askerName);");
    expect(shell).toContain('{mine && onSeeWho && kind !== "countdown" ? (');
    // The poll wears the same shell.
    expect(code("src/components/messages/PollBubble.tsx")).toContain('<StickerFace\n        kind="poll"');
  });
});
