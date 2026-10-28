import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { forwardedBody, isForwarded, LEGACY_FORWARD_PREFIX } from "@/lib/chat-forward";
import { msgSnippet } from "@/lib/chat-thread";

/**
 * "Forwarded" is a fact about a message, not words inside it.
 *
 * It used to be written onto the front of the body, which is what the
 * screenshot showed: a stray coloured glyph in the middle of a sentence.
 * It also followed the words into the inbox preview and a quoted reply,
 * doubled when a forward was forwarded, and never appeared at all on a
 * forwarded photo, voice note or document.
 *
 * The whitelist below was run against the live database inside a rolled
 * back transaction: a boolean true is kept, and `false`, `"true"`,
 * `"yes"`, `1`, a JSON null, an absent key and a null metadata are all
 * dropped, while `slide` still clamps and survives alongside it. The
 * replacement function was diffed line by line against the live one in
 * the same transaction — every non-blank line matches except the seven
 * this migration adds.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const sql = read("supabase/migrations/0177_forwarded_metadata.sql");
const sheet = read("src/components/messages/ForwardSheet.tsx");
const chat = read("src/components/messages/RealChatView.tsx");

describe("whether it was forwarded", () => {
  it("is read from the metadata", () => {
    expect(isForwarded({ body: "Hello", metadata: { forwarded: true } })).toBe(true);
    expect(isForwarded({ body: "Hello", metadata: { forwarded: false } })).toBe(false);
    expect(isForwarded({ body: "Hello", metadata: null })).toBe(false);
    expect(isForwarded({ body: "Hello" })).toBe(false);
  });

  it("and still recognised on anything sent the old way", () => {
    // Those messages are in people's threads already. The prefix is read
    // as the label it was standing in for.
    expect(isForwarded({ body: `${LEGACY_FORWARD_PREFIX}Hello` })).toBe(true);
  });

  it("but not on a message that merely mentions forwarding", () => {
    expect(isForwarded({ body: "I forwarded you that thing" })).toBe(false);
    expect(isForwarded({ body: `Look: ${LEGACY_FORWARD_PREFIX}Hello` })).toBe(false);
  });

  it("and a message with no body at all is not a crash", () => {
    // Every kind goes through this, and a photo's body is a URL while a
    // post's is null.
    expect(isForwarded({ body: null, metadata: { forwarded: true } })).toBe(true);
    expect(isForwarded({})).toBe(false);
  });
});

describe("what the message actually says", () => {
  it("is the words, without the label the old client baked in", () => {
    expect(forwardedBody(`${LEGACY_FORWARD_PREFIX}Hello`)).toBe("Hello");
  });

  it("stripped once, not every time it appears", () => {
    // A forward of a forward carried two. Taking one off leaves the
    // message as it was before the second forward, which is the truth;
    // stripping greedily would eat a line somebody actually wrote.
    expect(forwardedBody(`${LEGACY_FORWARD_PREFIX}${LEGACY_FORWARD_PREFIX}Hello`)).toBe(
      `${LEGACY_FORWARD_PREFIX}Hello`,
    );
  });

  it("and only at the front", () => {
    expect(forwardedBody(`Look: ${LEGACY_FORWARD_PREFIX}Hello`)).toBe(
      `Look: ${LEGACY_FORWARD_PREFIX}Hello`,
    );
  });

  it("an ordinary message is returned untouched", () => {
    expect(forwardedBody("Hello")).toBe("Hello");
    expect(forwardedBody("")).toBe("");
  });

  it("and nothing is still nothing", () => {
    expect(forwardedBody(null)).toBe(null);
    expect(forwardedBody(undefined)).toBe(null);
  });
});

describe("the inbox and the quoted reply", () => {
  it("show what was said, not the marker", () => {
    expect(msgSnippet({ kind: "text", body: `${LEGACY_FORWARD_PREFIX}Hello` })).toBe("Hello");
  });

  it("and are unchanged for everything else", () => {
    expect(msgSnippet({ kind: "text", body: "Hello" })).toBe("Hello");
    expect(msgSnippet({ kind: "image", body: "https://x/y.jpg" })).toBe("Photo");
    expect(msgSnippet({ kind: "text", body: null })).toBe("Message");
    expect(msgSnippet({ is_unsent: true, kind: "text", body: "Hello" })).toBe("Unsent message");
  });
});

describe("the flag the server will accept", () => {
  it("only a real boolean true", () => {
    // A string, a number or a null is a caller that does not mean it.
    expect(sql).toContain("if jsonb_typeof(p_metadata -> 'forwarded') = 'boolean'");
    expect(sql).toContain("and (p_metadata ->> 'forwarded')::boolean then");
    expect(sql).toContain("v_meta := v_meta || jsonb_build_object('forwarded', true);");
  });

  it("set before the row is written, or it would not be on it", () => {
    const flag = sql.indexOf("jsonb_build_object('forwarded', true)");
    const insert = sql.indexOf("insert into public.messages");
    expect(flag).toBeGreaterThan(-1);
    expect(flag).toBeLessThan(insert);
  });

  it("and the rest of the whitelist is untouched", () => {
    // The whole function is restated to add one block, so the other two
    // keys it admits have to still be here — and nothing else may be.
    expect(sql).toContain("if p_kind = 'post' and jsonb_typeof(p_metadata -> 'slide') = 'number' then");
    expect(sql).toContain("v_meta := v_meta || jsonb_build_object('comment_id', p_comment_id);");
    expect(sql).not.toContain("v_meta := p_metadata");
    expect(sql).not.toContain("v_meta := coalesce(p_metadata");
  });

  it("every kind can be forwarded, so the flag is not gated on one", () => {
    // A forwarded photo is as much a forward as a forwarded sentence.
    const block = sql.slice(sql.indexOf("-- Whether this was forwarded"));
    expect(block.slice(0, 400)).not.toContain("p_kind");
  });
});

describe("forwarding writes nothing into the words", () => {
  it("the body goes as it was", () => {
    // Asserted on what is built, not on whether the word appears: the
    // comment above the call explains the old behaviour and should not
    // have to avoid naming it.
    expect(sheet).toContain("p_body: one.body ?? undefined,");
    expect(sheet).not.toMatch(/const body =/);
    expect(sheet).not.toMatch(/${one.body}/);
  });

  it("and the fact is sent alongside it", () => {
    expect(sheet).toContain("p_metadata: { forwarded: true },");
  });
});

describe("the thread says it above the bubble", () => {
  it("as a label, in the same voice as Pinned", () => {
    expect(chat).toContain("isForwarded(m) && !m.is_unsent && (");
    expect(chat).toContain("Forwarded\n                        </span>");
  });

  it("for every kind, not only text", () => {
    // It sits in the column that wraps the bubble, beside the Pinned
    // label — not inside the plain-text branch, which is where the old
    // marker effectively lived.
    const label = chat.indexOf("isForwarded(m) && !m.is_unsent");
    const textBranch = chat.indexOf("/* Plain text — time + status tick live inside bubble");
    expect(label).toBeGreaterThan(-1);
    expect(label).toBeLessThan(textBranch);
  });

  it("and neither label is drawn in a colour that fails contrast", () => {
    // --color-faint measures 2.2–2.7:1 as text on this ground. Two
    // labels at different brightness in one stack also reads as a bug.
    const stack = chat.slice(chat.indexOf("{m.pinned_at && ("), chat.indexOf("isForwarded(m) && !m.is_unsent"));
    expect(stack).not.toContain("text-faint");
  });

  it("the words drawn are the words, with no marker left in them", () => {
    expect(chat).toContain("{forwardedBody(m.body)}");
  });
});
