import { describe, it, expect, beforeEach } from "vitest";
import { getSavedAccounts, upsertSavedAccount, removeSavedAccount, type SavedAccount } from "@/lib/saved-accounts";

const acct = (userId: string): SavedAccount => ({
  userId, email: `${userId}@x.com`, displayName: userId, username: userId,
  avatarHue: 200, avatarUrl: null, accessToken: "a", refreshToken: "r",
});

describe("saved-accounts", () => {
  beforeEach(() => localStorage.clear());

  it("starts empty", () => {
    expect(getSavedAccounts()).toEqual([]);
  });

  it("adds and updates (upsert by userId, no dupes)", () => {
    upsertSavedAccount(acct("u1"));
    upsertSavedAccount(acct("u2"));
    upsertSavedAccount({ ...acct("u1"), displayName: "renamed" });
    const list = getSavedAccounts();
    expect(list).toHaveLength(2);
    expect(list.find((a) => a.userId === "u1")?.displayName).toBe("renamed");
  });

  it("removes by userId", () => {
    upsertSavedAccount(acct("u1"));
    upsertSavedAccount(acct("u2"));
    removeSavedAccount("u1");
    expect(getSavedAccounts().map((a) => a.userId)).toEqual(["u2"]);
  });

  it("survives corrupt storage", () => {
    localStorage.setItem("hypefy_accounts", "not json");
    expect(getSavedAccounts()).toEqual([]);
  });
});
