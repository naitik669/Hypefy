import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Two holes the audit found and a dry run against the live database
 * confirmed: a group member could make themselves admin, and a locked chat
 * kept showing its contents in a banner.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const grants = read("supabase/migrations/0148_conversation_member_columns.sql");
const notifier = read("src/components/messages/InAppNotifier.tsx");

describe("a member cannot promote themselves", () => {
  it("the table-wide grant goes, because a column grant under it does nothing", () => {
    // The policy checks only user_id, so the columns are the whole
    // enforcement — and narrowing a column grant while a table-wide grant
    // stands changes nothing. That is why 0142 needed a trigger for the pin
    // columns on messages, where the table-wide UPDATE remains.
    expect(grants).toContain("revoke update on public.conversation_members from authenticated, anon;");
    expect(grants).toContain("grant update (muted_at, pinned_at) on public.conversation_members to authenticated;");
  });

  it("the grant covers exactly what the client writes, and nothing else", () => {
    // Everything else already goes through an RPC, which runs as the owner
    // and is unaffected by the grant: last_read_at via
    // mark_conversation_read, locked_at and hidden_at via set_chat_level,
    // role via the group-admin functions.
    const granted = /grant update \(([^)]*)\)/.exec(grants)![1].split(",").map((c) => c.trim());
    expect(granted.sort()).toEqual(["muted_at", "pinned_at"]);
    for (const forbidden of ["role", "user_id", "conversation_id", "request_accepted", "locked_at", "hidden_at"]) {
      expect(granted, forbidden).not.toContain(forbidden);
    }
  });

  it("only the two columns the UI patches are written directly", () => {
    // If a future change starts patching another column straight from the
    // client it will fail silently under RLS, so this is the thing to look
    // at. Mute is written in two places, pin in one.
    const sites = ["src/components/messages/ConversationInfo.tsx", "src/components/messages/RealChatView.tsx"];
    for (const f of sites) expect(read(f)).toContain("muted_at:");
    expect(read("src/components/messages/MessagesInbox.tsx")).toContain("pinned_at?: string | null");
  });

  it("insert and delete are left alone on purpose", () => {
    // Neither has a policy, so the row rule refuses them whatever the grant
    // says. Revoking as well would be noise.
    expect(grants).not.toContain("revoke insert");
    expect(grants).not.toContain("revoke delete");
  });
});

describe("a locked chat says nothing about itself", () => {
  it("the membership cache is dropped when the row changes", () => {
    // It was filled once at mount and never invalidated. This component
    // lives in the layout, so that cache was the life of the session: lock
    // a chat while the app was open and its sender and preview kept
    // appearing in banners.
    // Through the shell's shared channel since the four subscriptions were
    // consolidated; the membership stream is the same rows.
    expect(notifier).toContain("useMembershipUpdate(");
    // And the subscription behind it is still scoped to this reader's own
    // rows — it lives in the shared provider now, not here.
    const stream = read("src/components/messages/MessageStream.tsx");
    expect(stream).toContain('table: "conversation_members"');
    expect(stream).toContain("filter: `user_id=eq.${userId}`");
    expect(notifier).toContain("membership.current.delete(id);");
  });

  it("it is the same row the lock and the mute live on", () => {
    // Which is what makes one subscription enough for both.
    expect(notifier).toContain("locked: lockedIds.current.has(convId)");
    expect(notifier).toContain("muted: !!(memberRes.data as { muted_at: string | null }).muted_at");
  });

  it("a locked chat's banner carries no name and no words", () => {
    const gate = notifier.slice(notifier.indexOf("if (mem.locked)"), notifier.indexOf("if (mem.locked)") + 400);
    expect(gate).toContain("mem.locked");
    // And a reaction banner, which is a name and a face, is not shown at all.
    expect(notifier).toContain("if (!mem || mem.muted || mem.locked) return;");
  });
});
