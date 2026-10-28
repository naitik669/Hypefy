import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  MAX_POLL_OPTIONS,
  barWidth,
  pollReady,
  readPoll,
  tidyOptions,
  voteLabel,
} from "../src/lib/chat-poll";

/**
 * Polls in a conversation.
 *
 * The question is the message's body, the options and the tally are its
 * metadata, and who chose what is a table only the function may write.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*(--|\/\/).*$/gm, "");

const poll = (over: Record<string, unknown> = {}) =>
  readPoll({
    kind: "poll",
    body: "Where are we eating?",
    metadata: { options: ["Pizza", "Biryani"], multi: false, tally: [2, 1], voters: 3, ...over },
  });

describe("reading a poll off a message", () => {
  it("the question is the body, the rest is metadata", () => {
    const got = poll();
    expect(got?.question).toBe("Where are we eating?");
    expect(got?.options).toEqual(["Pizza", "Biryani"]);
    expect(got?.tally).toEqual([2, 1]);
    expect(got?.voters).toBe(3);
    expect(got?.multi).toBe(false);
  });

  it("anything that is not a poll reads as not a poll, rather than throwing", () => {
    // A jsonb column can hold an older shape, a newer one, or nothing.
    expect(readPoll({ kind: "text", body: "hi", metadata: null })).toBe(null);
    expect(readPoll({ kind: "poll", body: "q", metadata: null })).toBe(null);
    expect(readPoll({ kind: "poll", body: "q", metadata: {} })).toBe(null);
    expect(readPoll({ kind: "poll", body: "q", metadata: "nonsense" })).toBe(null);
    expect(readPoll({ kind: "poll", body: "q", metadata: { options: "Pizza" } })).toBe(null);
    expect(readPoll({ kind: "poll", body: "q", metadata: { options: [1, 2] } })).toBe(null);
  });

  it("a poll of one option is not a poll", () => {
    expect(poll({ options: ["Only this"] })).toBe(null);
    expect(poll({ options: ["Pizza", "  "] })).toBe(null);
  });

  it("an unsent poll shows nothing", () => {
    // The body is gone; a card with its options and no question is worse
    // than the "Unsent message" line the plain bubble gives.
    expect(
      readPoll({
        kind: "poll",
        body: null,
        is_unsent: true,
        metadata: { options: ["a", "b"], tally: [1, 0] },
      }),
    ).toBe(null);
  });

  it("a short or junk tally still gives one count per option", () => {
    // Otherwise a row renders a bar with no number under it.
    expect(poll({ tally: [5] })?.tally).toEqual([5, 0]);
    expect(poll({ tally: undefined })?.tally).toEqual([0, 0]);
    expect(poll({ tally: ["lots", -4] })?.tally).toEqual([0, 0]);
  });

  it("and more options than six is not something the reader has to police", () => {
    // send_poll refuses it; if a row somehow holds it, it still renders.
    const many = poll({ options: ["a", "b", "c", "d", "e", "f", "g"], tally: [1, 1, 1, 1, 1, 1, 1] });
    expect(many?.options.length).toBe(7);
    expect(many?.tally.length).toBe(7);
  });
});

describe("the bars", () => {
  it("the leading option fills its row", () => {
    expect(barWidth([3, 1], 0)).toBe(100);
    expect(barWidth([3, 1], 1)).toBe(33);
  });

  it("measured against the leader, not the total, so a multi poll cannot shrink", () => {
    // Four people each picking two options is a total of eight. Against the
    // total, the leader would look like it was losing ground as more people
    // agreed with it.
    expect(barWidth([4, 4], 0)).toBe(100);
    expect(barWidth([4, 4], 1)).toBe(100);
  });

  it("nobody has voted yet is no bar, not a division by zero", () => {
    expect(barWidth([0, 0], 0)).toBe(0);
    expect(barWidth([], 0)).toBe(0);
  });

  it("the count under the question reads as a sentence", () => {
    expect(voteLabel(0)).toBe("No votes yet");
    expect(voteLabel(1)).toBe("1 vote");
    expect(voteLabel(9)).toBe("9 votes");
  });
});

describe("writing one", () => {
  it("options are trimmed and blanks dropped", () => {
    expect(tidyOptions([" Pizza ", "", "   ", "Biryani"])).toEqual(["Pizza", "Biryani"]);
  });

  it("two options that read the same are one, keeping the first spelling", () => {
    expect(tidyOptions(["Pizza", "pizza", "PIZZA", "Biryani"])).toEqual(["Pizza", "Biryani"]);
  });

  it("and no more than the server will keep", () => {
    const lots = ["a", "b", "c", "d", "e", "f", "g", "h"];
    expect(tidyOptions(lots)).toHaveLength(MAX_POLL_OPTIONS);
  });

  it("the Send button is right about whether there is a poll here", () => {
    expect(pollReady("Where?", ["Pizza", "Biryani"])).toBe(true);
    expect(pollReady("  ", ["Pizza", "Biryani"])).toBe(false);
    expect(pollReady("Where?", ["Pizza"])).toBe(false);
    // Which is exactly the case the server refuses, so the button must too.
    expect(pollReady("Where?", ["Pizza", " pizza "])).toBe(false);
    expect(pollReady("q".repeat(201), ["a", "b"])).toBe(false);
  });
});

describe("what the server refuses", () => {
  const sql = strip(read("supabase/migrations/0174_dm_polls.sql"));

  it("only a member may post one or vote", () => {
    expect(sql).toContain("if not public.is_conv_member(p_conversation_id) then raise exception 'Not a member'");
    expect(sql).toContain("if not public.is_conv_member(v_conv) then raise exception 'Not a member'");
  });

  it("the option has to be one this poll offers", () => {
    // Bounded by the poll's own options, not just by the column: option 4
    // of a three-option poll is a voter nobody can account for.
    expect(sql).toContain("p_choice >= v_count then");
    expect(sql).toContain("jsonb_array_length(coalesce(v_meta -> 'options'");
  });

  it("an unsent or removed poll takes no more votes", () => {
    expect(sql).toContain("and not m.is_unsent and m.removed_at is null");
  });

  it("the tally is recomputed, never incremented", () => {
    // A counter that is bumped drifts from the rows it claims to summarise
    // the first time a delete and an insert interleave.
    expect(sql).toContain("select count(*) from public.message_poll_votes v");
    expect(sql).not.toMatch(/tally.*\+\s*1/);
  });

  it("nobody can write the votes table by hand", () => {
    // A client that could insert rows could vote as somebody else, and the
    // recomputed tally would report it faithfully.
    expect(sql).toContain("revoke all on table public.message_poll_votes from anon, authenticated;");
    expect(sql).toContain("grant select on table public.message_poll_votes to authenticated;");
    expect(sql).not.toContain("grant insert on table public.message_poll_votes");
  });

  it("and reading them is limited to the conversation they are in", () => {
    expect(sql).toContain("create policy poll_votes_read on public.message_poll_votes");
    expect(sql).toContain("for select using (");
  });

  it("send_message is left alone — a poll does not widen its metadata whitelist", () => {
    expect(sql).not.toContain("create or replace function public.send_message");
  });

  it("blocking holds for polls as it does for messages", () => {
    expect(sql).toContain("join public.blocked_users b on b.blocker_id = cm.user_id");
  });
});

describe("the poll in the thread", () => {
  const chat = read("src/components/messages/RealChatView.tsx");
  const bubble = read("src/components/messages/PollBubble.tsx");
  const composer = read("src/components/messages/PollComposer.tsx");

  it("reached from the menu the other attachments are in", () => {
    expect(chat).toContain('label: "Poll"');
    expect(chat).toContain('if (o.mode === "poll") setPollOpen(true);');
  });

  it("the card renders only when the message really is a poll", () => {
    expect(chat).toContain("})() : readPoll(m) ? (");
    expect(chat).toContain("poll={readPoll(m)!}");
  });

  it("the tally arrives with the message, not through a channel of its own", () => {
    // cast_poll_vote writes it into metadata, and the thread already
    // listens for message UPDATEs.
    expect(strip(read("supabase/migrations/0174_dm_polls.sql"))).toContain(
      "set metadata = metadata || jsonb_build_object('tally', v_tally, 'voters', v_voters)",
    );
    expect(bubble).not.toContain("postgres_changes");
  });

  it("pressing the option you chose takes the vote back", () => {
    expect(strip(read("supabase/migrations/0174_dm_polls.sql"))).toContain(
      "if v_had then",
    );
    expect(bubble).toContain("const had = chosen.has(i);");
  });

  it("a failed vote puts back what was there rather than inverting again", () => {
    // Inverting twice would leave the tick wrong after two failures.
    const fail = bubble.slice(bubble.indexOf("if (error) {"));
    expect(fail).toContain("if (had) next.add(i);");
    expect(fail).toContain("else next.delete(i);");
  });

  it("counts appear once you have voted, not before", () => {
    expect(bubble).toContain("const voted = chosen.size > 0;");
    expect(bubble).toContain("{voted && (");
  });

  it("the composer cannot offer a state the server refuses", () => {
    expect(composer).toContain("disabled={!ready}");
    expect(composer).toContain("const ready = pollReady(question, options);");
    expect(composer).toContain("options.length > MIN_POLL_OPTIONS");
    expect(composer).toContain("options.length < MAX_POLL_OPTIONS");
  });

  it("and it sends the options exactly as it was showing them", () => {
    expect(composer).toContain("onSend(question.trim(), tidyOptions(options), multi);");
  });
});
