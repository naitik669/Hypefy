import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Messages written now, sent later.
 *
 * The hazard of this feature is that the right to send a message can
 * disappear between writing it and sending it: the recipient blocks you,
 * you leave the group, your account is suspended.
 *
 * `messages` has triggers for all three — and not one of them fires for the
 * publisher, because every one begins by reading auth.uid(), which is null
 * in a cron job. Checked by reading the trigger sources, then confirmed by
 * running the whole thing against the live database inside a rolled-back
 * transaction: a message scheduled before a block does not arrive after it.
 *
 * These are the guarantees that would be silent if they broke.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const sql = read("supabase/migrations/0166_scheduled_messages.sql");
const deliver = sql.slice(sql.indexOf("create or replace function public.deliver_due_messages"));
const schedule = sql.slice(
  sql.indexOf("create or replace function public.schedule_message"),
  sql.indexOf("create or replace function public.deliver_due_messages"),
);

describe("the right to send is re-checked at delivery, not trusted from scheduling", () => {
  it("still a member", () => {
    expect(deliver).toContain("from public.conversation_members cm");
    expect(deliver).toContain("cm.user_id = r.sender_id");
  });

  it("not blocked by anyone who would receive it", () => {
    // The trigger that normally enforces this returns early when auth.uid()
    // is null, which it is here. Without this the feature is a way to post
    // into a conversation you have been blocked from.
    expect(deliver).toContain("join public.blocked_users b");
    expect(deliver).toContain("b.blocker_id = cm.user_id and b.blocked_id = r.sender_id");
  });

  it("not suspended", () => {
    expect(deliver).toContain("p.suspended_at is not null");
    expect(deliver).toContain("p.suspended_until is null or p.suspended_until > now()");
  });

  it("and the comment says why the triggers cannot be relied on", () => {
    // Whoever next edits this needs to know before they delete the checks
    // as redundant.
    expect(sql).toContain("auth.uid()");
    expect(sql).toContain("tg_messages_refuse_blocked");
  });
});

describe("one undeliverable message does not take the batch down", () => {
  it("each is its own subtransaction", () => {
    const body = deliver.slice(deliver.indexOf("loop"));
    expect(body).toContain("begin");
    expect(body).toContain("exception");
    expect(body).toContain("when others then");
  });

  it("and the batch is bounded", () => {
    expect(deliver).toContain("limit 200");
  });

  it("a message that cannot go is dropped, not retried forever", () => {
    expect(deliver.match(/delete from public\.scheduled_messages where id = r\.id;/g)?.length)
      .toBeGreaterThanOrEqual(4);
  });
});

describe("scheduling is checked while the sender is looking at it", () => {
  it("membership, emptiness, and blocks — the same things send_message checks", () => {
    expect(schedule).toContain("if not public.is_conv_member(p_conversation_id)");
    expect(schedule).toContain("btrim(p_body) = ''");
    expect(schedule).toContain("raise exception 'blocked'");
  });

  it("a time too soon or too far is refused", () => {
    expect(schedule).toContain("p_scheduled_at < now() + v_lim.min_lead");
    expect(schedule).toContain("p_scheduled_at > now() + v_lim.max_ahead");
  });

  it("and there is a ceiling on how many one account can queue", () => {
    expect(schedule).toContain("v_lim.max_pending");
  });

  it("a reply only attaches to a message in the same conversation", () => {
    // Otherwise the id is a way to point a reply at a thread you cannot see.
    expect(schedule).toContain("m.id = p_reply_to_id and m.conversation_id = p_conversation_id");
  });
});

describe("the limits in the database and in the sheet agree", () => {
  it("the same lead time and the same horizon", () => {
    // If these drift, the sheet offers a time the database then refuses.
    const lib = read("src/lib/schedule-send.ts");
    expect(sql).toContain("interval '30 seconds'");
    expect(lib).toContain("MIN_LEAD_MS = 30_000");
    expect(sql).toContain("interval '90 days'");
    expect(lib).toContain("MAX_AHEAD_MS = 90 * 24 * 60 * 60 * 1000");
  });
});

describe("a pending message is the sender's alone", () => {
  it("read and delete are both sender-only", () => {
    // The recipient learning that something is queued would spoil the point
    // of sending it later.
    expect(sql).toContain(`create policy "scheduled_messages: own read" on public.scheduled_messages
  for select using (sender_id = (select auth.uid()));`);
    expect(sql).toContain(`create policy "scheduled_messages: own delete" on public.scheduled_messages
  for delete using (sender_id = (select auth.uid()));`);
  });

  it("there is no insert policy, so everything goes through the function", () => {
    // That function is where the membership and block checks live.
    const statements = sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
    expect(statements).not.toContain("for insert with check");
  });

  it("and no update policy: changing it is cancel and re-schedule", () => {
    const statements = sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
    expect(statements).not.toContain("for update");
  });
});

describe("the composer", () => {
  const chat = read("src/components/messages/RealChatView.tsx");

  it("holding Send offers to schedule, and the same press does not also send", () => {
    expect(chat).toContain("openScheduleSheet()");
    expect(chat).toContain("if (sendHold.current.opened) { sendHold.current.opened = false; return; }");
  });

  it("only for a typed message, not an edit or an attachment", () => {
    const handler = chat.slice(chat.indexOf("onPointerDown={() => {\n                  if (editing || !text.trim()) return;"));
    expect(handler.slice(0, 120)).toContain("if (editing || !text.trim()) return;");
  });

  it("the body is sealed the same way a live send seals it", () => {
    const fn = chat.slice(chat.indexOf("function openScheduleSheet"));
    expect(fn.slice(0, 500)).toContain("sealFor(reader");
  });

  it("the composer is only emptied once the row exists", () => {
    // A failed schedule must leave the words where they were.
    expect(chat).toContain("onScheduled={() => {");
    const sheet = read("src/components/messages/ScheduleSendSheet.tsx");
    const fn = sheet.slice(sheet.indexOf("async function schedule"));
    expect(fn.indexOf("if (error)")).toBeLessThan(fn.indexOf("onScheduled()"));
  });

  it("and what is queued is visible, with a way to call it back", () => {
    expect(chat).toContain("<ScheduledStrip conversationId={conversationId} />");
    expect(read("src/components/messages/ScheduledStrip.tsx")).toContain("async function cancel(");
  });
});
