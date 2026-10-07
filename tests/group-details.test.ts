import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The group half of the chat details screen, in the same cards as the rest
 * of it, and the reactions list showing each person's own picture.
 */
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

describe("the group on the chat details screen", () => {
  const info = read("src/components/messages/ConversationInfo.tsx");
  const group = info.slice(info.indexOf("data-group-name"), info.indexOf('<div className="h-8" />'));

  it("sits in cards, not the old full-width rows", () => {
    expect(info).not.toContain("function Section(");
    expect(info).not.toContain("<Section");
    expect(group).toContain("data-group-members");
    expect(group.split("rounded-2xl bg-surface").length).toBeGreaterThanOrEqual(3);
  });

  it("what an admin can do to a member is behind that member's dots", () => {
    expect(group).toContain("aria-label={`Options for ${m.name}`}");
    expect(group).toContain("open={memberMenu === m.id}");
    expect(group).toContain('label={m.role === "admin" ? "Make a member" : "Make admin"}');
    expect(group).toContain('label="Remove from group"');
    // Only for admins, and never on yourself.
    expect(group).toContain("{isAdmin && m.id !== currentUserId && (");
  });

  it("removing still asks first, and changing a role still goes through the same call", () => {
    expect(group).toContain("setConfirmRemove(m);");
    expect(group).toContain('supabase.rpc("set_member_role", {');
    expect(group).toContain('p_role: m.role === "admin" ? "member" : "admin",');
  });

  it("adding people and renaming are still admin-only", () => {
    expect(group).toContain("disabled={!isAdmin}");
    expect(group).toContain("{isAdmin && name.trim() !== title && (");
    expect(group).toContain('supabase.rpc("add_conversation_member", {');
  });
});

describe("who reacted to a message", () => {
  const chat = read("src/components/messages/RealChatView.tsx");
  const sheet = chat.slice(chat.indexOf("{/* Reaction details"), chat.indexOf('title="Reactions"') + 1600);

  it("each person is shown with their own picture: you, group members and the other person", () => {
    expect(sheet).toContain(
      "const face = isMine ? self?.avatarUrl : members?.[r.user_id] ? members[r.user_id].avatarUrl : other.avatarUrl;",
    );
    expect(sheet).toContain("<Avatar name={name} hue={hue} size={40} src={face ?? undefined} />");
  });

  it("your own colour is yours, not a fixed one", () => {
    expect(sheet).toContain("const hue = isMine ? (self?.hue ?? 280) : members?.[r.user_id]?.hue ?? other.hue;");
  });
});
