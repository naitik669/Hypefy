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

describe("where it shows, and how you set one", () => {
  const info = read("src/components/messages/ConversationInfo.tsx");

  it("the member list draws what you call them", () => {
    expect(info).toContain("displayNameFor(m.id, m.name, nicknames)");
  });

  it("including the initial on their avatar", () => {
    // Drawn from a different string, the letter and the label disagree.
    // Scoped to the member row: the first <Avatar> in the file is the
    // header's, which is the chat's own picture and not a member at all.
    const row = info.slice(info.indexOf("data-member={m.id}"));
    const avatar = row.slice(row.indexOf("<Avatar"), row.indexOf("<Avatar") + 260);
    expect(avatar).toContain("displayNameFor(m.id, m.name, nicknames)");
  });

  it("anyone can name anyone, because it is not an admin power", () => {
    // What you call someone is yours and reaches nobody else's screen,
    // so gating it behind admin would be gating the wrong thing.
    expect(info).toContain("{m.id !== currentUserId && (");
    const btn = info.slice(info.indexOf("Rename ${m.name} for yourself") - 400);
    expect(btn.slice(0, 500)).not.toContain("isAdmin");
  });

  it("except yourself", () => {
    expect(info).toContain("aria-label={`Rename ${m.name} for yourself`}");
  });

  it("the sheet is keyed on who it is naming", () => {
    // Otherwise it reopens holding the last person's name, and syncing
    // that across in an effect is the thing the key exists to avoid.
    expect(info).toContain('key={naming ?? "none"}');
  });

  it("and clearing is offered as going back to their own name", () => {
    expect(info).toContain('{draft.trim() ? "Save" : "Use their own name"}');
    expect(info).toContain("Only you see this.");
  });
});

describe("loading and saving them", () => {
  const hook = read("src/components/messages/useNicknames.ts");

  it("one query for the whole chat, not one per member", () => {
    expect(hook).toContain('.from("conversation_nicknames")');
    expect(hook).toContain('.eq("conversation_id", conversationId)');
  });

  it("the client is made once, not per render", () => {
    // A fresh client each render changes every callback's identity, which
    // is what put ScheduledStrip in a render loop.
    expect(hook).toContain("const [supabase] = useState(createClient);");
  });

  it("a rename shows before the server answers", () => {
    expect(hook).toContain("setNicknames((prev) => {");
    expect(hook).toContain('await supabase.rpc("set_nickname"');
  });

  it("and is taken back if it did not stick", () => {
    // The rollback has to follow the error check with nothing in between:
    // asserting the lines exist somewhere passes an `if (false)` in front
    // of them, which is how the first version of this proved nothing.
    const fn = hook.slice(hook.indexOf("const rename"));
    expect(fn).toMatch(
      /if \(!error\) return true;\s*\n\s*setNicknames\(\(prev\) => \{[\s\S]*?previous === undefined/,
    );
  });

  it("a late answer for a chat you have left is dropped", () => {
    expect(hook).toContain("if (dropped || !data) return;");
  });

  it("and it never sends more than the column holds", () => {
    expect(hook).toContain("name.trim().slice(0, 40)");
  });
});
