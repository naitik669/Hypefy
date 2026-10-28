import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * A link that lets someone into a group.
 *
 * Holding it is enough by default; an admin can turn approval on, and then
 * the link only asks. All of it was run against the live database inside
 * rolled-back transactions: a non-admin refused a link, an admin got 32
 * hex characters, an outsider joined and then got "already", a wrong code
 * refused, and with approval on the joiner stayed out — seeing zero
 * messages and zero conversation rows while they waited.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
/** Statements only. Every file here explains in prose the very thing it
 *  must not do, and a comment satisfies toContain just as well as code. */
const code_ = (sql: string) =>
  sql
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

const base = read("supabase/migrations/0170_group_invite_links.sql");
const join = read("supabase/migrations/0172_join_by_invite_unambiguous.sql");
const code = read("supabase/migrations/0171_invite_code_without_pgcrypto.sql");

describe("waiting is not membership", () => {
  it("a pending join is its own table, not a flag on a member row", () => {
    // conversation_members has request_accepted, and reusing it would
    // have been the obvious thing and a hole: is_conv_member does not
    // look at that column, so somebody waiting to be let in would have
    // passed every policy in the schema and read the chat meanwhile.
    expect(base).toContain("create table if not exists public.conversation_join_requests");
    expect(code_(base)).not.toContain("request_accepted");
  });

  it("so nothing is written to conversation_members until it is approved", () => {
    const fn = join.slice(join.indexOf("if v_needs then"));
    const untilReturn = fn.slice(0, fn.indexOf("'pending'"));
    expect(untilReturn).not.toContain("insert into public.conversation_members");
  });

  it("and whether you wait at all is the group's own setting", () => {
    // Without this, turning approval on changes nothing and everybody
    // walks straight in — which is the one failure this toggle exists to
    // prevent, and the only one a passing suite could still hide.
    expect(join).toContain("select i.conversation_id, i.requires_approval into v_conv, v_needs");
    expect(join).toContain("if v_needs then");
    const branch = join.slice(join.indexOf("if v_needs then"));
    expect(branch.slice(0, 400)).toContain("conversation_join_requests");
    expect(branch.slice(0, 400)).toContain("'pending'");
  });

  it("and approving is what creates the membership", () => {
    expect(base).toContain("if p_accept then");
    expect(base).toContain("insert into public.conversation_members (conversation_id, user_id, role)");
  });
});

describe("who may do what", () => {
  it("only an admin makes a link, changes it, or puts it away", () => {
    for (const fnName of ["set_group_invite", "set_group_invite_approval", "clear_group_invite"]) {
      const at = base.indexOf(`function public.${fnName}`);
      expect(at, fnName).toBeGreaterThan(-1);
      expect(base.slice(at, at + 700), fnName).toContain("is_conv_admin");
    }
  });

  it("and only an admin decides who comes in", () => {
    const at = base.indexOf("function public.decide_join_request");
    expect(base.slice(at, at + 400)).toContain("is_conv_admin");
  });

  it("members can read their group's link; strangers cannot", () => {
    // join_by_invite looks a code up with the definer's rights, which is
    // the only way a stranger ever touches this table.
    expect(base).toContain("for select using (public.is_conv_member(conversation_id));");
    expect(base).toContain("grant select on public.conversation_invites to authenticated;");
  });

  it("nobody writes either table directly", () => {
    const statements = base
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");
    expect(statements).not.toContain("for insert with check");
    expect(statements).not.toContain("for update using");
    expect(base).toContain("grant select, delete on public.conversation_join_requests to authenticated;");
  });

  it("but you can always withdraw your own request", () => {
    expect(base).toContain('create policy "join requests: own withdraw"');
    expect(base).toContain("for delete using (user_id = (select auth.uid()));");
  });
});

describe("using a link", () => {
  it("a link only works for a group", () => {
    expect(base).toContain("where id = p_conversation_id and type = 'group'");
  });

  it("using it twice says so rather than doubling anything", () => {
    expect(join).toContain("'outcome', 'already'");
  });

  it("a block stops it, in either direction", () => {
    expect(join).toContain("b.blocker_id = cm.user_id and b.blocked_id = v_me");
    expect(join).toContain("b.blocker_id = v_me and b.blocked_id = cm.user_id");
  });

  it("and a blocked stranger is told the same thing as a dead link", () => {
    // Telling someone they have been blocked is telling them something.
    const blocked = join.slice(join.indexOf("b.blocker_id = v_me"));
    expect(blocked.slice(0, 220)).toContain("That link does not work any more");
  });

  it("signing out is not a way in", () => {
    expect(join).toContain("if v_me is null then");
    expect(join).toContain("revoke all on function public.join_by_invite(text) from public, anon;");
  });

  it("making a new link is how an old one is revoked", () => {
    expect(code).toContain("on conflict (conversation_id) do update");
    expect(code).toContain("set code = excluded.code");
  });
});

describe("two mistakes that only a running database finds", () => {
  it("the code is made without pgcrypto", () => {
    // 0170 used gen_random_bytes, which lives in pgcrypto and not in
    // public — and every definer here pins search_path to public. Valid
    // DDL, and the function failed the first time it was called.
    expect(code).toContain("replace(gen_random_uuid()::text, '-', '')");
    expect(code_(code)).not.toContain("gen_random_bytes");
  });

  it("and the join returns one object rather than shadowed columns", () => {
    // `returns table (conversation_id uuid, ...)` made every bare
    // conversation_id in the body mean two things, and Postgres refused
    // at the first call.
    expect(join).toContain("returns jsonb");
    expect(join).toContain("jsonb_build_object('conversation_id', v_conv, 'outcome'");
    expect(code_(join)).not.toContain("returns table (conversation_id");
  });
});

describe("the link in the app", () => {
  const read2 = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
  const info = read2("src/components/messages/ConversationInfo.tsx");
  const hook = read2("src/components/messages/useGroupInvite.ts");

  it("only an admin of a group sees the controls", () => {
    // Scoped to this section. The file has three admin-gated blocks, so
    // asserting the string exists somewhere passes with this one ungated
    // — which is how the first version of this missed it.
    const at = info.indexOf("Invite link");
    expect(at).toBeGreaterThan(-1);
    expect(info.slice(Math.max(0, at - 420), at)).toContain("{isGroup && isAdmin && (");
  });

  it("the switch says which of the two things the link does", () => {
    expect(info).toContain('"Anyone with the link can ask to join."');
    expect(info).toContain('"Anyone with the link can join."');
  });

  it("and making a new one is named as what it does to the old", () => {
    expect(info).toContain("A new link stops the old one working.");
  });

  it("the waiting list is only drawn when somebody is waiting", () => {
    expect(info).toContain("{groupInvite.waiting.length > 0 && (");
  });

  it("every write is a function call, never a table write", () => {
    // Admin is checked on the server. The client asking nicely is not a
    // check, and this file is where it would be tempting to pretend.
    for (const fn of [
      "set_group_invite",
      "set_group_invite_approval",
      "clear_group_invite",
      "decide_join_request",
    ]) {
      expect(hook, fn).toContain(`supabase.rpc("${fn}"`);
    }
    expect(hook).not.toContain(".insert(");
    expect(hook).not.toContain(".update(");
  });

  it("a refusal comes back as false, not as a thrown error", () => {
    // The caller is a button and has to say something.
    expect(hook).toContain("if (error || typeof data !== \"string\") return false;");
    // Both of them: the switch and the revoke each hold a previous value
    // and each has to put it back. One rollback covers one button.
    expect(hook.split("setInvite(before);").length - 1).toBe(2);
    expect(hook.split("setWaiting(before);").length - 1).toBe(1);
  });
});

describe("where a link lands", () => {
  const read2 = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
  const land = read2("src/components/messages/JoinByInvite.tsx");
  const page = read2("src/app/(app)/join/[code]/page.tsx");

  it("shows nothing about the group before anyone has let you in", () => {
    // The name, the picture and the size belong to people who have not
    // agreed to show a stranger anything. A link is a door, not a window.
    expect(land).not.toContain("conversations");
    expect(page).not.toContain("from(");
    expect(page).toContain("robots: { index: false, follow: false }");
  });

  it("asks exactly once, however many times React mounts it", () => {
    // Strict Mode mounts twice. The second call is harmless; the race
    // between two navigations is not.
    expect(land).toContain("if (tried.current) return;");
    expect(land).toContain("tried.current = true;");
  });

  it("joining goes into the chat, and replaces rather than stacks", () => {
    // Back should go where they came from, not through a join already made.
    expect(land).toContain("router.replace(`/messages/${result.conversation_id}`)");
  });

  it("waiting says so and stays put, because there is nowhere to send them", () => {
    expect(land).toContain('result?.outcome === "pending"');
    expect(land).toContain("An admin has to let you in.");
  });

  it("and a dead link says so in the words the server used", () => {
    expect(land).toContain('setState({ kind: "failed", why: error.message })');
  });
});
