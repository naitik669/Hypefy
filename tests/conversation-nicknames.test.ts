import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { displayNameFor } from "@/lib/nicknames";

/**
 * What you call someone, in one chat.
 *
 * A group of eight display names, half a first name and half an aesthetic,
 * is hard to read. A nickname fixes that for the person doing the reading
 * and nobody else.
 *
 * The refusals below were each run against the live database inside a
 * rolled-back transaction before the migration was applied: naming a
 * non-member, naming inside a chat you are not in, and 41 characters all
 * refused; 40 accepted; and the subject reading what they were called
 * returned nothing.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const sql = read("supabase/migrations/0169_conversation_nicknames.sql");

describe("nobody sees it but you", () => {
  it("read and delete are both yours alone", () => {
    expect(sql).toContain('for select using (owner_id = (select auth.uid()));');
    expect(sql).toContain('for delete using (owner_id = (select auth.uid()));');
  });

  it("including the person you named", () => {
    // Which is the whole reason this needs no moderation: there is
    // nothing here for anyone to be shown, so nothing to report.
    expect(sql).toContain("owner_id = (select auth.uid())");
    expect(sql).not.toContain("subject_id = (select auth.uid())");
  });

  it("and there is no way to write one except through the function", () => {
    const statements = sql
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");
    expect(statements).not.toContain("for insert with check");
    expect(statements).not.toContain("for update using");
    expect(sql).toContain("grant select, delete on public.conversation_nicknames to authenticated;");
  });
});

describe("naming someone", () => {
  it("needs you to be in the chat", () => {
    // A nickname in a thread you cannot see is a thread you should not
    // know exists.
    expect(sql).toContain("if not public.is_conv_member(p_conversation_id) then");
  });

  it("and needs them to be in it too", () => {
    // Otherwise it is a way to probe for whether an account exists.
    expect(sql).toContain("where conversation_id = p_conversation_id and user_id = p_subject_id");
  });

  it("a blank name is how you stop, not a second function", () => {
    expect(sql).toContain("if v_name = '' then");
    expect(sql).toContain("delete from public.conversation_nicknames");
  });

  it("trimmed, and bounded in the table as well as the function", () => {
    // The table refuses it even if something ever writes past the RPC.
    expect(sql).toContain("btrim(nickname) <> '' and char_length(nickname) between 1 and 40");
    expect(sql).toContain("if char_length(v_name) > 40 then");
    expect(sql).toContain("btrim(coalesce(p_nickname, ''))");
  });

  it("one name per person per chat, replaced rather than piled up", () => {
    expect(sql).toContain("primary key (conversation_id, owner_id, subject_id)");
    expect(sql).toContain("on conflict (conversation_id, owner_id, subject_id)");
  });

  it("and a signed-out caller cannot reach the function at all", () => {
    expect(sql).toContain(
      "revoke all on function public.set_nickname(uuid, uuid, text) from public, anon;",
    );
    expect(sql).toContain(
      "grant execute on function public.set_nickname(uuid, uuid, text) to authenticated;",
    );
  });
});

describe("which name the thread shows", () => {
  const nicks = { "u-1": "Kurk" };

  it("the nickname, when there is one", () => {
    expect(displayNameFor("u-1", "Kurkure Singh", nicks)).toBe("Kurk");
  });

  it("their own name, when there is not", () => {
    expect(displayNameFor("u-2", "Spidey", nicks)).toBe("Spidey");
  });

  it("and never an empty label, whatever it is handed", () => {
    // An avatar draws its initial from this, and "" has none.
    expect(displayNameFor("u-3", "", {})).toBe("Someone");
    expect(displayNameFor("u-3", null, {})).toBe("Someone");
    expect(displayNameFor("u-3", "   ", {})).toBe("Someone");
  });

  it("a blank nickname is not a nickname", () => {
    // Clearing goes through the RPC, but a half-written row must not
    // blank somebody's name in the meantime.
    expect(displayNameFor("u-1", "Kurkure Singh", { "u-1": "   " })).toBe("Kurkure Singh");
  });
});
