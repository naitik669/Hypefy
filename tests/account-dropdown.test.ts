import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { hasAny, unreadFor, unreadForAll, type Asker } from "@/lib/account-unread";
import type { SavedAccount } from "@/lib/saved-accounts";

/**
 * The arrow beside the Messages title, and what it knows about the other
 * accounts on this device: how many chats and how much activity are waiting
 * on each.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

const account = (userId: string): SavedAccount => ({
  userId,
  email: `${userId}@x.test`,
  displayName: userId,
  username: userId,
  avatarHue: 200,
  avatarUrl: null,
  accessToken: "token",
  refreshToken: "refresh",
});

/** A stand-in for one account's client, and a note of what it was asked. */
function asker(answer: { chats?: unknown; chatsError?: unknown; activity?: number | null; activityError?: unknown }) {
  const asked: string[] = [];
  const client: Asker = {
    rpc: async (fn: string) => {
      asked.push(fn);
      return { data: answer.chats ?? 0, error: answer.chatsError ?? null };
    },
    from: (table: string) => {
      asked.push(table);
      const leaf = {
        eq: () => leaf,
        then: (res: (v: unknown) => void) =>
          res({ count: answer.activity ?? null, error: answer.activityError ?? null }),
      };
      return { select: () => leaf } as unknown as ReturnType<Asker["from"]>;
    },
  };
  return { client, asked };
}

describe("what is waiting on another account", () => {
  it("asks that account for its chats and its activity", async () => {
    const a = asker({ chats: 3, activity: 2 });
    expect(await unreadFor(account("aman"), () => a.client)).toEqual({ chats: 3, activity: 2 });
    expect(a.asked).toEqual(["unread_dm_count", "notifications"]);
  });

  it("nothing waiting is zero, not nothing", async () => {
    const a = asker({ chats: 0, activity: 0 });
    expect(await unreadFor(account("x"), () => a.client)).toEqual({ chats: 0, activity: 0 });
  });

  it("a token that has expired says nothing, rather than saying zero", async () => {
    // Zero would be a lie printed beside a name with ten unread chats behind it.
    expect(await unreadFor(account("x"), () => asker({ chatsError: { message: "JWT expired" } }).client)).toBeNull();
    expect(await unreadFor(account("x"), () => asker({ activityError: {} }).client)).toBeNull();
  });

  it("a client that throws is nothing too, not a crash", async () => {
    const broken = {
      rpc: () => {
        throw new Error("offline");
      },
      from: () => {
        throw new Error("offline");
      },
    } as unknown as Asker;
    await expect(unreadFor(account("x"), () => broken)).resolves.toBeNull();
  });

  it("a count that never arrived reads as zero, not as NaN", async () => {
    const a = asker({ chats: null, activity: null });
    expect(await unreadFor(account("x"), () => a.client)).toEqual({ chats: 0, activity: 0 });
  });

  it("one account failing says nothing about the rest", async () => {
    const found = await unreadForAll([account("a"), account("b")], (who) =>
      who.userId === "a" ? asker({ chatsError: {} }).client : asker({ chats: 1, activity: 4 }).client,
    );
    expect(found).toEqual({ a: null, b: { chats: 1, activity: 4 } });
  });

  it("only an account with something waiting is worth drawing", () => {
    expect(hasAny(null)).toBe(false);
    expect(hasAny(undefined)).toBe(false);
    expect(hasAny({ chats: 0, activity: 0 })).toBe(false);
    expect(hasAny({ chats: 0, activity: 2 })).toBe(true);
    expect(hasAny({ chats: 1, activity: 0 })).toBe(true);
  });

  it("speaks as that account and keeps nothing of them afterwards", () => {
    const src = read("src/lib/account-unread.ts");
    expect(src).toContain("Authorization: `Bearer ${account.accessToken}`");
    expect(src).toContain("auth: { persistSession: false, autoRefreshToken: false }");
  });
});

describe("the arrow on the title", () => {
  const src = read("src/components/messages/AccountDropdown.tsx");

  it("says it is a control, and which way it is pointing", () => {
    expect(src).toContain('aria-haspopup="menu"');
    expect(src).toContain("aria-expanded={open}");
    expect(src).toContain('aria-label={`${title}. Switch account`}');
    expect(src).toContain('open ? "rotate-180 text-accent" : ""');
  });

  it("uses the app's own chat and activity marks, each with its number", () => {
    expect(src).toContain('import { Chat } from "@phosphor-icons/react";');
    expect(src).toContain("<Chat size={13} weight=\"fill\" aria-hidden />");
    expect(src).toContain("<Star size={12} fill=\"currentColor\" strokeWidth={0} aria-hidden />");
    // The digits are read out as what they count, not left as bare numbers.
    expect(src).toContain("aria-label={`${unread.chats} unread chats`}");
    expect(src).toContain("aria-label={`${unread.activity} new activity`}");
  });

  it("asks for the counts when it opens, not when the page loads", () => {
    expect(src).toContain("function toggle()");
    expect(src).toContain("void unreadForAll(others)");
    // No effect watching `open`, which would be a render for nothing.
    expect(src).not.toContain("useEffect");
  });

  it("the account you are on is marked, and is not something to switch to", () => {
    expect(src).toContain("<Row account={mine} current onPick={() => setOpen(false)} />");
    expect(src).toContain("others.map((a) => (");
  });

  it("a dead account is dropped rather than left to be tapped again", () => {
    expect(src).toContain("removeSavedAccount(account.userId);");
    expect(src).toContain("That account needs signing in to again.");
  });

  it("switching reloads the page, since nothing on it belongs to the new person", () => {
    expect(src).toContain('window.location.assign("/messages")');
  });

  it("is on the Messages title, and the old note about it is gone", () => {
    const header = read("src/components/messages/MessagesHeader.tsx");
    expect(header).toContain('<AccountDropdown currentUserId={currentUserId} title="Messages" />');
    expect(header).not.toContain("Account switching lives in one place now");
  });
});
