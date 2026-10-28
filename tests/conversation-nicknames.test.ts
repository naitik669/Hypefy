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
  const hookSource = read("src/components/messages/useNicknames.ts");

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
    // Renaming reaches everybody's screen now (0176), which is a reason
    // to say who did it, not a reason to make it an admin power: anyone
    // in the chat can undo it just as easily.
    const btn = info.slice(info.indexOf("Rename ${m.name} in this chat") - 500);
    expect(btn.slice(0, 600)).not.toContain("isAdmin");
  });

  it("and the private label is still drawn where no shared one exists", () => {
    // 0169's rows did not go away. displayNameFor is handed the merged
    // map, and mergeNicknames is where the two meet — see
    // tests/shared-nicknames.test.ts for the precedence itself.
    expect(info).toContain("displayNameFor(m.id, m.name, nicknames)");
    expect(hookSource).toContain("mergeNicknames(shared, personal)");
  });

  it("the sheet is keyed on who it is naming", () => {
    // Otherwise it reopens holding the last person's name, and syncing
    // that across in an effect is the thing the key exists to avoid.
    expect(info).toContain('key={naming ?? "none"}');
  });

  it("and clearing is offered as going back to their own name", () => {
    expect(info).toContain('{draft.trim() ? "Save" : "Use their own name"}');
  });
});

describe("loading and saving them", () => {
  const hook = read("src/components/messages/useNicknames.ts");

  it("one query for the whole chat, not one per member", () => {
    expect(hook).toContain('.from("conversation_nicknames")');
    expect(hook).toContain('.eq("conversation_id", conversationId)');
  });

  it("and the private rows are still read, not abandoned", () => {
    // A label somebody set before 0176 keeps working.
    expect(hook).toContain("setPersonal(byId(mine as Row[]))");
  });

  it("the client is made once, not per render", () => {
    // A fresh client each render changes every callback's identity, which
    // is what put ScheduledStrip in a render loop.
    expect(hook).toContain("const [supabase] = useState(createClient);");
  });

  it("a rename shows before the server answers", () => {
    // It writes the shared table now (0176). The optimism is the same:
    // the write cannot be refused for anything the client could have
    // known in advance.
    expect(hook).toContain("setShared((prev) => {");
    expect(hook).toContain('await supabase.rpc("set_shared_nickname"');
  });

  it("and is taken back if it did not stick", () => {
    // The rollback has to follow the error check with nothing in between:
    // asserting the lines exist somewhere passes an `if (false)` in front
    // of them, which is how the first version of this proved nothing.
    const fn = hook.slice(hook.indexOf("const rename"));
    expect(fn).toMatch(
      /if \(!error\) return true;\s*\n\s*setShared\(\(prev\) => \{[\s\S]*?previous === undefined/,
    );
  });

  it("a late answer for a chat you have left is dropped", () => {
    expect(hook).toContain("if (dropped) return;");
  });

  it("and it never sends more than the column holds", () => {
    // Through the same helper the function's own cleaning mirrors, so the
    // field shows what the chat is about to see.
    expect(hook).toContain("tidyNickname(name)");
  });
});

describe("and in the thread itself", () => {
  const chat = read("src/components/messages/RealChatView.tsx");

  it("one helper answers it for every place a name is written", () => {
    // The sender line, the quoted reply and the photo viewer's title all
    // go through senderName. Three copies is how a nickname shows in one
    // and not another.
    expect(chat).toContain("displayNameFor(id, members?.[id]?.name ?? other.name, nicknames)");
    expect(chat.match(/senderName\(/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("you are still You, not whatever you called yourself", () => {
    expect(chat).toContain('id === currentUserId\n      ? "You"');
  });

  it("the face beside a message agrees with the name above it", () => {
    expect(chat).toContain("const whoName = displayNameFor(m.sender_id, who.name, nicknames);");
    expect(chat).toContain("<Avatar name={whoName}");
    expect(chat).not.toContain("<Avatar name={who.name}");
  });

  it("and the link to their profile is labelled with it too", () => {
    expect(chat).toContain("aria-label={`${whoName}'s profile`}");
  });
});
