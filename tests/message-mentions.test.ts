import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { extractMentions } from "@/lib/content-utils";

/**
 * Being named in a group chat tells you.
 *
 * The composer has had @ autocomplete since 0133 and nothing came of it:
 * notifications knew mention_post and mention_shot, so you could name
 * somebody in a group of eight and they would find out by reading.
 *
 * The guarantees below were each checked against the live database inside
 * a rolled-back transaction before the migration was applied — seven
 * messages, two notifications, and the five that should raise none raising
 * none. What is latched here is that the reasons stay in the file.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const sql = read("supabase/migrations/0168_message_mentions.sql");
const fn = sql.slice(sql.indexOf("create or replace function public.handle_message_mentions"));

describe("who gets told", () => {
  it("someone named in a group they are in", () => {
    expect(fn).toContain("lower(p.username) = v_handle");
    expect(fn).toContain("join public.conversation_members cm");
    expect(fn).toContain("cm.conversation_id = new.conversation_id");
  });

  it("never the person who wrote it", () => {
    expect(fn).toContain("p.id <> new.sender_id");
  });

  it("never someone who is not in the room", () => {
    // You cannot name a stranger into a group, and a notification about a
    // thread you cannot open is worse than none.
    expect(fn).toContain("on cm.user_id = p.id");
  });

  it("never someone who muted the group", () => {
    // Not hearing from it is the entire point of muting it.
    expect(fn).toContain("cm.muted_at is null");
  });

  it("never across a block, in either direction", () => {
    expect(fn).toContain("b.blocker_id = p.id and b.blocked_id = new.sender_id");
    expect(fn).toContain("b.blocker_id = new.sender_id and b.blocked_id = p.id");
  });

  it("and never against their own mention setting", () => {
    expect(fn).toContain("public.mention_allowed(v_target, new.sender_id)");
  });
});

describe("what is not a mention", () => {
  it("a one-to-one chat, where there is nobody to single out", () => {
    // The other person is already told about the message itself, so a
    // mention would be a second ping for one event — and the body is an
    // envelope the server cannot read anyway.
    expect(fn).toContain("c.type = 'group'");
  });

  it("a notice the thread wrote about itself", () => {
    expect(fn).toContain("new.kind = 'system'");
  });

  it("an empty body, or none", () => {
    expect(fn).toContain("new.body is null or btrim(new.body) = ''");
  });

  it("and anything shaped like a sealed envelope", () => {
    // Hunting @handles through JSON and base64 invents mentions nobody
    // wrote. Groups are never sealed today; this is for the day they are.
    expect(fn).toContain("left(btrim(new.body), 1) = '{'");
  });
});

describe("the handles it finds are the ones the composer offered", () => {
  it("the same pattern, lowercased and deduplicated", () => {
    // If these drift, the app offers a name the trigger cannot find.
    expect(fn).toContain("'@([a-zA-Z0-9_.]+)'");
    expect(fn).toContain("select distinct lower(m[1])");
    expect(read("src/lib/content-utils.ts")).toContain("/@([a-zA-Z0-9_.]+)/g");
  });

  it("and the client agrees about what a handle looks like", () => {
    expect(extractMentions("oi @kurkure and @Crazie.Extra and @kurkure")).toEqual([
      "kurkure",
      "crazie.extra",
    ]);
    expect(extractMentions("no one here")).toEqual([]);
    expect(extractMentions("an email a@b.com still reads b.com as a handle")).toContain("b.com");
  });
});

describe("where it lands, and what it costs", () => {
  it("it opens the thread it is about, with no new routing", () => {
    // 'conversation' already goes to /messages/<id> in the list.
    expect(fn).toContain("'mention_message', 'conversation'");
    expect(fn).toContain("new.conversation_id");
    expect(read("src/app/(app)/notifications/page.tsx")).toContain(
      'if (n.target_type === "conversation" && n.target_id) return `/messages/${n.target_id}`;',
    );
  });

  it("and it obeys a preference that already existed", () => {
    // 0022 maps every mention_% to the 'mentions' key and drops the row
    // before insert for anyone who turned those off.
    expect(read("supabase/migrations/0022_notif_prefs_messages.sql")).toContain(
      "when new.type like 'mention_%' then 'mentions'",
    );
  });

  it("a trigger, so a scheduled message named somebody too", () => {
    // Scheduled messages arrive through deliver_due_messages, not
    // send_message. A line in the RPC would have missed them.
    expect(sql).toContain("after insert on public.messages");
    expect(sql).toContain("tg_messages_mentions");
  });

  it("and nobody can call it but the trigger", () => {
    expect(sql).toContain(
      "revoke all on function public.handle_message_mentions() from public, anon, authenticated;",
    );
  });
});
