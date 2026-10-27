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

describe("the picker", () => {
  const sheet = read("src/components/messages/ScheduleSendSheet.tsx");

  it("offers the three offsets, then the drums", () => {
    expect(sheet).toContain("presets(now).map");
    expect(sheet).toContain("Pick a date and time");
  });

  it("the first thing on it is the time it will send, not a list of options", () => {
    // The four rows it replaced were near-identical slabs with the times
    // themselves muted and pushed right. Nothing was louder than anything
    // else, so there was nothing to read first.
    expect(sheet).toContain("const when = describeParts(chosen, now);");
    expect(sheet).toContain("{when.day}");
    expect(sheet).toContain("{when.time}");
  });

  it("and a screen reader is handed one sentence, not two sized fragments", () => {
    // Two lines is a typographic decision. Read aloud it is "Tomorrow",
    // "11:15 AM" — two orphans with nothing saying what they are.
    expect(sheet).toContain('aria-live="polite"');
    expect(sheet).toContain("Sending ${describeWhen(chosen, now).toLowerCase()}");
    const headline = sheet.slice(sheet.indexOf('aria-live="polite"'), sheet.indexOf("{when.time}"));
    expect(headline.match(/aria-hidden/g)?.length).toBe(2);
  });

  it("there is exactly one place this sends from", () => {
    // The offsets used to send on tap while the drums ended in their own
    // Send. Two commit points in one sheet is how the same message gets
    // scheduled twice, and how a tap commits something never displayed.
    expect(sheet.match(/void schedule\(/g)?.length).toBe(1);
  });

  it("an offset sets the time rather than sending it", () => {
    const fn = sheet.slice(sheet.indexOf("function pickPreset"));
    const body = fn.slice(0, fn.indexOf("\n  }"));
    expect(body).toContain("setPresetId(id)");
    expect(body).not.toContain("schedule(");
  });

  it("so a tap on one is taken back by a tap on another", () => {
    // Absolute, not cumulative. "+1 day" would read as stacking, and from
    // inside the sheet stacking has no way back.
    expect(sheet).toContain("onClick={() => pickPreset(p.id, p.at)}");
    expect(sheet).toContain("aria-pressed={presetId === p.id}");
  });

  it("and touching any drum puts the chips out", () => {
    // Otherwise a chip goes on claiming a time the drums have moved off.
    for (const fn of ["pickDay", "pickMinute", "pickHour12", "pickMeridiem"]) {
      const at = sheet.indexOf(`function ${fn}(`);
      expect(at, fn).toBeGreaterThan(-1);
      // To the closing brace, not a fixed window — the next function along
      // sets it too, so a window that overruns passes either way.
      const body = sheet.slice(at, sheet.indexOf("\n  }", at));
      expect(body, fn).toContain("setPresetId(null)");
    }
  });

  it("uses the same wheel as the birthday picker, not a second one", () => {
    // A second drum implementation is a second set of scroll-feedback bugs.
    expect(sheet).toContain('from "@/components/ui/Wheel"');
    expect(read("src/components/ui/DateOfBirthPicker.tsx")).toContain('from "@/components/ui/Wheel"');
    // And the shared one is the only place the behaviour lives.
    expect(read("src/components/ui/Wheel.tsx")).toContain("export function WheelColumn");
  });

  it("the date is its own step: date, month, year", () => {
    const dateStep = sheet.slice(
      sheet.indexOf('{step === "date" && ('),
      sheet.indexOf('{step === "time" && ('),
    );
    for (const label of ['ariaLabel="Date"', 'ariaLabel="Month"', 'ariaLabel="Year"']) {
      expect(dateStep, label).toContain(label);
    }
    // The clock is the step after, not alongside.
    expect(dateStep).not.toContain('ariaLabel="Hour"');
  });

  it("the date drums read off the chosen day rather than holding their own state", () => {
    // Three independent pieces of state are three things that can drift
    // apart from each other and from what gets sent.
    expect(sheet).toContain("const picked = dayFromOffset(offset, now);");
    expect(sheet).toContain("[picked.getFullYear(), picked.getMonth(), picked.getDate()]");
  });

  it("moving one date drum settles the other two", () => {
    // February the 31st, or December in a range that stops in November.
    expect(sheet).toContain('function setDatePart(part: "year" | "month" | "day", value: number)');
    const fn = sheet.slice(sheet.indexOf("function setDatePart"));
    expect(fn.slice(0, 500)).toContain("clampDate(");
    expect(fn.slice(0, 500)).toContain("offsetOfDate(");
  });

  it("then the clock, as three drums", () => {
    const timeStep = sheet.slice(sheet.indexOf('{step === "time" && ('));
    for (const label of ['ariaLabel="Hour"', 'ariaLabel="Minute"', 'ariaLabel="AM or PM"']) {
      expect(timeStep, label).toContain(label);
    }
    expect(timeStep).not.toContain('ariaLabel="Day"');
  });

  it("and the clock header says which day it is setting", () => {
    // Otherwise the second step is three drums with no idea what they
    // belong to.
    expect(sheet).toContain('{step === "date" ? "Pick a date" : dayLabel}');
  });

  it("the time is settled against the day just chosen", () => {
    // Picking tomorrow after looking at today must not land on an hour
    // that only made sense yesterday.
    const fn = sheet.slice(sheet.indexOf("function openClock()"));
    expect(fn.slice(0, 300)).toContain("clampTime(day, hour, minute, now)");
  });

  it("opens on a time that is already worth sending", () => {
    // It opened on a hardcoded noon today, which from one o'clock onwards is
    // in the past. Invisible while the first step only listed offsets; the
    // first thing read now that the chosen time is the headline.
    expect(sheet).toContain("openingChoice(new Date())");
    expect(sheet).not.toContain("useState(12)");
  });

  it("and seeds every part of that time from one reading of the clock", () => {
    // Four separate new Date() calls can land either side of a millisecond
    // and seed a day that disagrees with its own hour.
    expect(sheet.match(/openingChoice\(/g)?.length).toBe(1);
    expect(sheet).toContain("const [seed] = useState(() => openingChoice(new Date()));");
    for (const part of ["seed.offset", "seed.hour", "seed.minute", "seed.presetId"]) {
      expect(sheet, part).toContain(part);
    }
  });

  it("the 24-hour value stays the single source of truth", () => {
    // Storing hour12 and the meridiem separately is how the two drums end
    // up disagreeing with each other and with what gets sent.
    expect(sheet).toContain("const { hour12, meridiem } = to12h(hour);");
    expect(sheet).toContain("withTime(day, hour, minute)");
  });

  it("changing AM/PM stays in the half just chosen", () => {
    // clampTime alone falls back to the first valid hour of the whole day,
    // which would flip the drum straight back.
    expect(sheet).toContain("clampWithinMeridiem(day, hour12, to, minute, now)");
  });

  it("moving the day pulls a stranded time forward", () => {
    // Going from tomorrow to today can leave the clock on an hour that has
    // gone, and the Send button would sit dead with nothing saying why.
    expect(sheet).toContain("const fixed = clampTime(dayFromOffset(next, now), hour, minute, now);");
  });

  it("each step walks back one, rather than closing", () => {
    expect(sheet).toContain('setStep(step === "time" ? "date" : "presets")');
    expect(sheet).toContain('aria-label={step === "time" ? "Back to the date" : "Back"}');
  });

  it("the clock hands its time back to the headline", () => {
    // Rather than being a second Send. The headline is what the sheet
    // promises, so the drums have to settle there before anything goes.
    const timeStep = sheet.slice(sheet.indexOf('{step === "time" && ('));
    expect(timeStep).toContain('onClick={() => setStep("presets")}');
    expect(timeStep).toContain('{problem ?? "Done"}');
  });

  it("the send button says what it will do, or why it cannot", () => {
    expect(sheet).toContain('{problem ?? "Schedule"}');
    const presetStep = sheet.slice(
      sheet.indexOf('{step === "presets" && ('),
      sheet.indexOf('{step === "date" && ('),
    );
    expect(presetStep).toContain("{problem ?? `Sending");
  });

  it("and refuses a time the database would refuse", () => {
    expect(sheet).toContain("disabled={busy || problem !== null}");
  });
});

describe("an unsent message survives the app closing", () => {
  const chat = read("src/components/messages/RealChatView.tsx");

  it("every failure goes through one place that keeps it", () => {
    // Six send paths failed in six slightly different ways. One of them
    // forgetting to persist is one kind of message that still vanishes.
    expect(chat).toContain("function keepFailed(m: ChatMsg)");
    expect(chat.match(/keepFailed\(/g)?.length).toBeGreaterThanOrEqual(6);
    expect(chat).not.toContain('_status: "failed" as const } : m)));');
  });

  it("and what it writes down is the wire, never a sealed body's words", () => {
    const fn = chat.slice(chat.indexOf("function keepFailed"));
    expect(fn.slice(0, 700)).toContain("wire: m._cipher ?? m.body");
    expect(fn.slice(0, 700)).toContain("sealed: !!m._cipher");
  });

  it("and it writes unconditionally — marking the screen is not keeping it", () => {
    // Asserting the call exists is not the same as asserting it runs: an
    // `if (false)` in front of it passed the first version of this.
    const fn = chat.slice(chat.indexOf("function keepFailed"));
    expect(fn.slice(0, 700)).toMatch(
      /_status: "failed" as const \} : x\)\)\);\s*\n\s*queueOutbox\(currentUserId, \{/,
    );
  });

  it("a message that went is one the device forgets", () => {
    // Left behind, it comes back as a duplicate the next time the thread
    // opens — the one failure worse than the one being fixed.
    expect(chat.match(/dropOutbox\(currentUserId,/g)?.length).toBe(2);
  });

  it("a retry spends an attempt rather than trying for ever", () => {
    const fn = chat.slice(chat.indexOf("async function retrySend"));
    expect(fn.slice(0, 1600)).toContain("recordAttempt(currentUserId, failed.id)");
  });

  it("and the thread puts back what it finds when it opens", () => {
    expect(chat).toContain("outboxFor(currentUserId, conversationId)");
    expect(chat).toContain("toRestore(waiting, prev, currentUserId)");
    expect(chat).toContain("restoredMessage(e, currentUserId)");
  });

  it("in the order they were written, not at the foot of the thread", () => {
    // A message from last night belongs above this morning's replies.
    const fn = chat.slice(chat.indexOf("const waiting = outboxFor"));
    expect(fn.slice(0, 900)).toContain("a.created_at.localeCompare(b.created_at)");
  });

  it("and never twice, when one is already on screen", () => {
    const fn = chat.slice(chat.indexOf("const waiting = outboxFor"));
    expect(fn.slice(0, 900)).toContain("!here.has(e.tempId)");
  });
});

describe("and goes by itself when the connection comes back", () => {
  const chat = read("src/components/messages/RealChatView.tsx");
  const fn = chat.slice(chat.indexOf("Send again what the connection took away"));

  it("on the browser saying it is back", () => {
    expect(fn.slice(0, 1400)).toContain('window.addEventListener("online", flush)');
    expect(fn.slice(0, 1400)).toContain('window.removeEventListener("online", flush)');
  });

  it("and on opening the thread, which is the case that actually happens", () => {
    // An app killed on the underground and opened at the surface is
    // already online when it loads. That `online` event never comes, so
    // without this nothing ever retries by itself.
    expect(fn.slice(0, 1400)).toContain("void flush();");
  });

  it("not while the device says it is offline", () => {
    expect(fn.slice(0, 1400)).toContain("navigator.onLine === false) return");
  });

  it("only what still has attempts left", () => {
    // One that has spent them is drawn as failed and waits for the
    // sender. That is what having a budget is for.
    expect(fn.slice(0, 1400)).toContain("if (isTerminal(e)) continue;");
  });

  it("one at a time, and it stops if the thread goes away mid-flush", () => {
    // Firing them all at once is a burst at exactly the moment the
    // connection is least able to take one.
    expect(fn.slice(0, 1400)).toContain("await retrySend(");
    expect(fn.slice(0, 1400)).toContain("if (stopped) return;");
    expect(fn.slice(0, 1400)).toContain("stopped = true;");
  });
});
