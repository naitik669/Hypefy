import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { displayNameFor, mergeNicknames, tidyNickname } from "@/lib/nicknames";

/**
 * What the chat calls someone: one name, everybody sees it.
 *
 * 0169 made nicknames private and said that shared ones, if ever wanted,
 * would be a different table rather than a widened one. This is that
 * table, and 0169's rows are untouched.
 *
 * Every refusal below was run against the live database inside a rolled
 * back transaction before the migration was written out: naming somebody
 * who is not in the chat refused, an outsider naming anybody refused, a
 * signed-out caller refused, 41 characters refused, 40 accepted, setting
 * the name it already has added no message, newlines collapsed to one
 * space, and the read policy gave both members the row while an outsider
 * got nothing. The four announcement wordings were read back in physical
 * insert order, because every row written in one transaction shares
 * `now()` and ordering by created_at cannot tell them apart.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const sql = read("supabase/migrations/0176_shared_nicknames.sql");
const old = read("supabase/migrations/0169_conversation_nicknames.sql");
const hook = read("src/components/messages/useNicknames.ts");
const chat = read("src/components/messages/RealChatView.tsx");
const info = read("src/components/messages/ConversationInfo.tsx");

/** The body of one plpgsql function, so an assertion cannot pass on another. */
function functionBody(source: string, name: string): string {
  const start = source.indexOf(`function public.${name}(`);
  expect(start, `${name} is not in this file`).toBeGreaterThan(-1);
  const end = source.indexOf("end $$;", start);
  expect(end, `${name} has no end`).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("which name wins", () => {
  it("the shared one, over a private one for the same person", () => {
    // The point of a shared name is that the chat agrees. A private label
    // quietly outranking it would make the announcement in the thread a
    // lie about what everyone is seeing.
    expect(mergeNicknames({ a: "Boss" }, { a: "Mine" })).toEqual({ a: "Boss" });
  });

  it("and the private one where there is no shared one", () => {
    // A label somebody set before any of this shipped keeps working
    // rather than disappearing out from under them.
    expect(mergeNicknames({ b: "Boss" }, { a: "Mine" })).toEqual({ a: "Mine", b: "Boss" });
  });

  it("either side may be empty", () => {
    expect(mergeNicknames({}, { a: "Mine" })).toEqual({ a: "Mine" });
    expect(mergeNicknames({ a: "Boss" }, {})).toEqual({ a: "Boss" });
    expect(mergeNicknames({}, {})).toEqual({});
  });

  it("and neither is changed by merging", () => {
    const shared = { a: "Boss" };
    const personal = { a: "Mine", b: "Other" };
    mergeNicknames(shared, personal);
    expect(shared).toEqual({ a: "Boss" });
    expect(personal).toEqual({ a: "Mine", b: "Other" });
  });

  it("and the merged map is what gets drawn", () => {
    const names = mergeNicknames({ a: "Boss" }, { a: "Mine" });
    expect(displayNameFor("a", "Their Own Name", names)).toBe("Boss");
    expect(displayNameFor("z", "Their Own Name", names)).toBe("Their Own Name");
  });
});

describe("a nickname as it will be stored", () => {
  it("trimmed, and runs of space brought down to one", () => {
    expect(tidyNickname("  Boss   man ")).toBe("Boss man");
  });

  it("newlines and control characters are space, not content", () => {
    // A name is drawn on one line beside an avatar. Forty characters of
    // newline is a way to push the rest of a row off it.
    expect(tidyNickname("top\n\n\nbottom")).toBe("top bottom");
    expect(tidyNickname("a\u0000\u001f\u007fb")).toBe("a b");
    expect(tidyNickname("a\tb")).toBe("a b");
  });

  it("forty characters, no more", () => {
    expect(tidyNickname("x".repeat(41))).toHaveLength(40);
    expect(tidyNickname("y".repeat(40))).toHaveLength(40);
  });

  it("nothing but whitespace is nothing, which is how you clear it", () => {
    expect(tidyNickname("   ")).toBe("");
    expect(tidyNickname("\n\t")).toBe("");
    expect(tidyNickname("")).toBe("");
  });

  it("and it matches what the function will do to the same string", () => {
    // Both sides strip the same class and bound at the same number, so
    // the field shows what the chat is about to see.
    expect(sql).toContain("regexp_replace(coalesce(p_nickname, ''), '[\\s\\u0000-\\u001f\\u007f]+', ' ', 'g')");
    expect(sql).toContain("if char_length(v_name) > 40 then raise exception 'Too long'; end if;");
  });
});

describe("the whole chat sees it, and only the chat", () => {
  it("any member reads every name in it", () => {
    expect(sql).toContain(
      'for select using (public.is_conv_member(conversation_id));',
    );
  });

  it("including the person who was named, unlike the private table", () => {
    // Which is the difference that needed a new table: 0169 is readable
    // by its owner alone, and stays that way.
    expect(sql).not.toContain("owner_id");
    expect(old).toContain("for select using (owner_id = (select auth.uid()));");
  });

  it("but a stranger reads nothing — shared is not public", () => {
    expect(sql).toContain("revoke all on public.conversation_display_names from anon, authenticated;");
    expect(sql).toContain("grant select on public.conversation_display_names to authenticated;");
  });

  it("and there is no way to write one except through the function", () => {
    // A direct write would change the name on everyone's screen with
    // nothing in the thread to say who did it.
    const statements = sql
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");
    expect(statements).not.toContain("for insert with check");
    expect(statements).not.toContain("for update using");
    expect(statements).not.toContain("for delete using");
    expect(statements).not.toMatch(/grant [^\n]*(insert|update|delete)[^\n]* on public\.conversation_display_names/);
  });
});

describe("naming someone", () => {
  const fn = functionBody(sql, "set_shared_nickname");

  it("needs you to be in the chat", () => {
    // Writing into a thread you cannot see is a thread you should not
    // know exists.
    expect(fn).toContain("if not public.is_conv_member(p_conversation_id) then");
    expect(fn).toContain("raise exception 'Not a member'");
  });

  it("and needs them to be in it too", () => {
    // Otherwise it is a way to probe for whether an account exists.
    expect(fn).toContain("where conversation_id = p_conversation_id and user_id = p_subject_id");
    expect(fn).toContain("raise exception 'Not in this chat'");
  });

  it("and needs you to be signed in at all", () => {
    expect(fn).toContain("if v_me is null then raise exception 'Not authenticated'; end if;");
  });

  it("works on yourself as much as on anybody else", () => {
    // In a DM that reads as "mine and theirs", which is what was asked
    // for. Nothing excludes p_subject_id = v_me, and the announcement has
    // a wording for it.
    expect(fn).not.toContain("p_subject_id <> v_me");
    expect(fn).toContain("' set their own nickname to '");
    expect(fn).toContain("' cleared their own nickname'");
  });

  it("names them by their own name in the announcement, not by the nickname", () => {
    // The announcement has to name somebody the whole chat can identify,
    // and the name being replaced is the one thing it cannot use.
    expect(fn).toContain("select coalesce(display_name, username, 'Someone') into v_subject");
    expect(fn).toContain("from public.profiles where id = p_subject_id");
  });

  it("one name per person per chat, replaced rather than piled up", () => {
    expect(sql).toContain("primary key (conversation_id, subject_id)");
    expect(fn).toContain("on conflict (conversation_id, subject_id)");
    expect(fn).toContain("do update set nickname = excluded.nickname");
  });

  it("records who did it, and keeps the name if they leave", () => {
    // A shared label with no author is one nobody can answer for; but the
    // chat still has to agree on the name after somebody deletes their
    // account, so the row survives the author.
    expect(fn).toContain("set_by = excluded.set_by");
    expect(sql).toContain("set_by uuid references public.profiles(id) on delete set null");
  });

  it("bounded in the table as well as in the function", () => {
    expect(sql).toContain("btrim(nickname) <> '' and char_length(nickname) between 1 and 40");
  });
});

describe("everybody is told", () => {
  const fn = functionBody(sql, "set_shared_nickname");

  it("as an ordinary system message, which is also how other screens redraw", () => {
    // conversations is not in the realtime publication and neither is
    // this table; messages is. The same trick chat themes use.
    expect(fn.match(/perform public\.send_message\(/g)).toHaveLength(2);
    expect(fn.match(/'system'/g)).toHaveLength(2);
  });

  it("when it is set, and when it is cleared", () => {
    expect(fn).toContain("' set '");
    expect(fn).toContain("' cleared '");
  });

  it("a blank name clears, rather than a second function", () => {
    expect(fn).toContain("if v_name = '' then");
    expect(fn).toContain("delete from public.conversation_display_names");
  });

  it("but setting the name it already has says nothing at all", () => {
    // Repeated saves must not fill the thread with announcements of no
    // change, and the check has to come before the write and the message.
    expect(fn).toContain("if coalesce(v_old, '') = v_name then return; end if;");
    const quiet = fn.indexOf("= v_name then return");
    const first = fn.indexOf("perform public.send_message(");
    expect(quiet).toBeGreaterThan(-1);
    expect(quiet).toBeLessThan(first);
  });
});

describe("the foreign keys are indexed", () => {
  it("because both are checked on every profile delete", () => {
    // The primary key already serves "every name in this chat"; these two
    // are the ones the advisor would otherwise flag.
    expect(sql).toContain("conversation_display_names_subject_idx");
    expect(sql).toContain("conversation_display_names_set_by_idx");
  });
});

describe("the client reads both and writes the shared one", () => {
  it("renaming calls the shared function, not the private one", () => {
    expect(hook).toContain('supabase.rpc("set_shared_nickname"');
    expect(hook).not.toContain('supabase.rpc("set_nickname"');
  });

  it("reads both tables, in parallel, once per conversation", () => {
    expect(hook).toContain('.from("conversation_nicknames")');
    expect(hook).toContain('.from("conversation_display_names")');
    expect(hook).toContain("await Promise.all([");
  });

  it("and sends the name through the same tidying the function applies", () => {
    expect(hook).toContain("const clean = tidyNickname(name);");
  });

  it("precedence is decided in one place, not at each call site", () => {
    expect(hook).toContain("mergeNicknames(shared, personal)");
  });

  it("a refused rename puts the old name back", () => {
    expect(hook).toContain("if (!error) return true;");
    expect(hook).toContain("if (previous === undefined) delete back[subjectId];");
  });

  it("refreshing re-reads the shared names only", () => {
    // Private names cannot change behind your back, so there is nothing
    // to re-read there.
    const refresh = hook.slice(hook.indexOf("const refresh ="), hook.indexOf("const rename ="));
    expect(refresh).toContain("setShared(");
    expect(refresh).not.toContain("setPersonal(");
  });
});

describe("the thread keeps up", () => {
  it("a system message is the cue to read the names again", () => {
    // The only way a name on this screen changes without this screen
    // doing it.
    const branch = chat.slice(chat.indexOf('if (m.kind === "system") {'));
    expect(branch.slice(0, 600)).toContain("void refreshNicknames();");
  });

  it("and the name at the top of a DM is the shared one", () => {
    // It had the profile name written straight in, which was fine while a
    // nickname was private to whoever set it.
    expect(chat).toContain("const peerName = displayNameFor(other.id, other.name, nicknames);");
    expect(chat).toContain("<DisplayName name={peerName} profile={other.cosmetics}");
    expect(chat).toContain("<Avatar name={peerName} hue={other.hue} size={36}");
  });
});

describe("the sheet tells the truth about who sees it", () => {
  it("plainly, because it used to be private", () => {
    expect(info).toContain("Everyone in this chat sees this, and is told when it changes.");
    expect(info).not.toContain("Only you see this.");
  });

  it("and it edits the shared name, not the effective one", () => {
    // Otherwise clearing it would look like it did nothing while an older
    // private name showed through.
    expect(info).toContain('current={naming ? (sharedNames[naming] ?? "") : ""}');
  });

  it("you can name yourself", () => {
    expect(info).toContain('isSelf={naming === currentUserId}');
    expect(info).toContain('? "Rename yourself in this chat"');
    expect(info).toContain('title={isSelf ? "Your nickname" : "Nickname"}');
  });

  it("and the rename control is drawn for every member, yourself included", () => {
    // It used to be hidden on your own row, which is exactly the thing
    // that was asked for in a DM.
    const row = info.slice(info.indexOf("<Pencil size={15} />") - 900, info.indexOf("<Pencil size={15} />"));
    expect(row).not.toContain("m.id !== currentUserId &&");
    expect(row).toContain("onClick={() => setNaming(m.id)}");
  });
});

describe("the inbox agrees with the thread", () => {
  const rows = read("src/app/(app)/messages/load-rows.ts");

  it("the names are loaded with everything else, not in a round trip of their own", () => {
    expect(rows).toContain('.from("conversation_display_names")');
    expect(rows).toContain("const [membersRes, msgsRes, myMemberRes, reactionsRes, nicknamesRes] = await Promise.all([");
  });

  it("and applied to the members, so every line that writes a name follows", () => {
    // The DM's title, a group's automatic title and the "who sent the last
    // one" line all read member.name. One pass is three surfaces that
    // cannot drift apart.
    expect(rows).toContain("if (who) who.name = n.nickname;");
    const apply = rows.indexOf("who.name = n.nickname");
    const groupTitle = rows.indexOf("members.slice(0, 3).map((m) => m.name)");
    expect(apply).toBeGreaterThan(-1);
    expect(groupTitle).toBeGreaterThan(apply);
  });
});

describe("the sheet answers who it is naming", () => {
  it("the person is drawn, not just referred to", () => {
    // The old sheet put their name in the title and their nickname in the
    // field, so "Spidey" above "Spidey" gave no way to tell whether a
    // nickname was set — the one question the sheet exists to answer.
    const sheet = info.slice(info.indexOf("function NicknameSheet"), info.indexOf("export function ConversationInfo"));
    expect(sheet).toContain("member: RosterMember | null;");
    // Scoped to the 44px avatar at the top. The preview row below uses
    // the same prop, so matching the string anywhere in the file passed
    // with the identity block deleted.
    const face = sheet.slice(sheet.indexOf("<Avatar"), sheet.indexOf("size={44}") + 12);
    expect(face).toContain("name={ownName}");
    expect(face).toContain("src={member?.avatarUrl ?? undefined}");
    expect(sheet).toContain('{member?.username ? `@${member.username}` : "Their own name"}');
  });

  it("and the field holds the nickname alone", () => {
    const sheet = info.slice(info.indexOf("function NicknameSheet"), info.indexOf("export function ConversationInfo"));
    expect(sheet).toContain("value={draft}");
    expect(sheet).toContain("placeholder={ownName}");
  });

  it("the member is handed over whole", () => {
    expect(info).toContain('member={members.find((m) => m.id === naming) ?? null}');
  });
});

describe("the sheet shows what will actually be saved", () => {
  const sheet = info.slice(info.indexOf("function NicknameSheet"), info.indexOf("export function ConversationInfo"));

  it("tidied the way the server tidies it", () => {
    // Runs of space collapse and 41 characters become 40. A save that
    // quietly differs from what was typed is a save you cannot trust.
    expect(sheet).toContain("const clean = tidyNickname(draft);");
    expect(sheet).toContain("const shown = clean || ownName;");
  });

  it("and what an empty field means is said, not guessed at", () => {
    expect(sheet).toContain('"No nickname — their own name shows"');
  });

  it("saving sends the tidied name, not the raw one", () => {
    expect(sheet).toContain("onSave(clean);");
  });

  it("the cap is one number, shared with the column", () => {
    expect(sheet).toContain("maxLength={NICKNAME_MAX}");
    expect(info).toContain("const NICKNAME_MAX = 40;");
  });

  it("and the counter appears near the limit rather than always", () => {
    // At 2/40 it is noise; running into a cap unwarned is what it is for.
    expect(sheet).toContain("{draft.length >= COUNTER_FROM && (");
    expect(info).toContain("const COUNTER_FROM = 28;");
  });
});

describe("the sheet's two actions", () => {
  const sheet = info.slice(info.indexOf("function NicknameSheet"), info.indexOf("export function ConversationInfo"));

  it("saving is refused when there is nothing to save", () => {
    expect(sheet).toContain("const unchanged = clean === current.trim();");
    expect(sheet).toContain("disabled={unchanged}");
  });

  it("and clearing is only offered when there is something to clear", () => {
    expect(sheet).toContain("{current.trim() && (");
  });
});
