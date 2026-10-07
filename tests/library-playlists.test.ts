// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync, readdirSync } from "node:fs";
import { toFolder } from "@/lib/folders";
import {
  nextInQueue,
  playlistError,
  sharedLine,
  toInvites,
  toMembers,
  whoIs,
} from "@/lib/playlists";

/**
 * Library: what Saved became. Playlists hold sounds as well as posts and
 * Shots, and can be shared with people who are invited and accept.
 */

describe("a playlist's people", () => {
  const rows = [
    { id: "c", name: "Cy", username: "cy", avatar_hue: 3, avatar_url: null, status: "invited", is_owner: false },
    { id: "b", name: null, username: "bo", avatar_hue: null, avatar_url: "b.jpg", status: "joined", is_owner: false },
    { id: "a", name: "Ana", username: "ana", avatar_hue: 1, avatar_url: null, status: "joined", is_owner: true },
  ];

  it("are listed owner first, then who joined, then who has not answered", () => {
    expect(toMembers(rows).map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("are read defensively", () => {
    const [, bo] = toMembers(rows);
    expect(bo).toMatchObject({ name: "bo", hue: 280, avatarUrl: "b.jpg", status: "joined", isOwner: false });
    expect(toMembers(null)).toEqual([]);
  });

  it("are named by handle where there is one", () => {
    expect(whoIs({ username: "ana", name: "Ana" })).toBe("@ana");
    expect(whoIs({ username: null, name: "Ana" })).toBe("Ana");
  });
});

describe("invitations", () => {
  it("say which playlist and who asked", () => {
    const [inv] = toInvites([
      { collection_id: "p1", name: "Late night edits", emoji: "🎧", item_count: "9", owner_name: "Maya", owner_username: "maya", owner_hue: 20, owner_avatar: null },
    ]);
    expect(inv).toMatchObject({ playlistId: "p1", name: "Late night edits", emoji: "🎧", itemCount: 9 });
    expect(inv.owner).toMatchObject({ name: "Maya", username: "maya", hue: 20 });
  });

  it("drop rows with no playlist or no name", () => {
    expect(toInvites([{ collection_id: "p1" }, { name: "x" }, null as never])).toEqual([]);
    expect(toInvites(undefined)).toEqual([]);
  });
});

describe("the line under a shared playlist", () => {
  it("says who shared it, or how many it is shared with, or nothing", () => {
    expect(sharedLine({ isOwner: false, memberCount: 2, ownerUsername: "maya" })).toBe("Shared by @maya");
    expect(sharedLine({ isOwner: false, memberCount: 2, ownerUsername: null })).toBe("Shared with you");
    expect(sharedLine({ isOwner: true, memberCount: 2, ownerUsername: "me" })).toBe("Shared with 2");
    expect(sharedLine({ isOwner: true, memberCount: 0, ownerUsername: "me" })).toBeNull();
  });
});

describe("what a refusal says", () => {
  it("repeats what the database meant to be read, and nothing else", () => {
    expect(playlistError("P0001: This playlist is full", "x")).toBe("This playlist is full");
    expect(playlistError("You can invite people you follow who follow you back", "x")).toBe(
      "You can invite people you follow who follow you back",
    );
    expect(playlistError('duplicate key value violates unique constraint "collection_members_pkey"', "Couldn't invite them.")).toBe(
      "Couldn't invite them.",
    );
    expect(playlistError(null, "fallback")).toBe("fallback");
  });
});

describe("playing a playlist's sounds through", () => {
  it("starts at the top, moves on one at a time, and stops at the end", () => {
    const ids = ["a", "b", "c"];
    expect(nextInQueue(ids, null)).toBe("a");
    expect(nextInQueue(ids, "a")).toBe("b");
    expect(nextInQueue(ids, "b")).toBe("c");
    expect(nextInQueue(ids, "c")).toBeNull();
  });

  it("stops when the one that was playing has been taken out", () => {
    expect(nextInQueue(["a", "c"], "b")).toBeNull();
    expect(nextInQueue([], null)).toBeNull();
  });
});

describe("a playlist on the shelf", () => {
  const base = { id: "p", name: "x", emoji: null, color: null, position: 0, cover_url: null, item_count: 2, covers: [] };

  it("is your own unless the database says otherwise", () => {
    expect(toFolder(base)).toMatchObject({ isOwner: true, memberCount: 0, ownerUsername: null });
    expect(toFolder({ ...base, is_owner: false, member_count: 3, owner_username: "maya" })).toMatchObject({
      isOwner: false,
      memberCount: 3,
      ownerUsername: "maya",
    });
  });

  it("shows a sound's artwork in its cover like any other picture", () => {
    const f = toFolder({ ...base, covers: [{ kind: "sound", thumb: "art.jpg" }, { kind: "shot", thumb: null, video: "v.mp4" }] });
    expect(f.covers).toEqual([
      { kind: "post", thumb: "art.jpg", video: null },
      { kind: "shot", thumb: null, video: "v.mp4" },
    ]);
  });
});

describe("the rename", () => {
  const read = (p: string) => readFileSync(p, "utf8");

  it("Library is the page, and Saved sends people to it", () => {
    expect(read("src/app/(app)/library/page.tsx")).toContain("export default async function LibraryPage()");
    const old = read("src/app/(app)/saved/page.tsx");
    expect(old).toContain('redirect("/library")');
    expect(old).not.toContain("SavedScreen");
  });

  it("Settings, the Home shortcut, Help and the profile all say Library", () => {
    expect(read("src/app/(app)/settings/page.tsx")).toMatch(/href: "\/library",\s+label: "Library"/);
    expect(read("src/components/layout/BottomNav.tsx")).toContain('label: "Library", href: "/library"');
    expect(read("src/app/(app)/help/page.tsx")).toContain('term: "Library"');
    expect(read("src/app/(app)/profile/page.tsx")).toContain('aria-label="Library"');
  });

  it("nothing a person reads still says folder", () => {
    const dir = "src/components/saved";
    const offenders: string[] = [];
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".tsx"))) {
      const lines = read(`${dir}/${f}`).split(/\r?\n/);
      lines.forEach((line, i) => {
        // Words on screen: JSX text, and the strings given to toasts, titles and labels.
        const shown = [
          ...line.matchAll(/>([^<>{}]*)</g),
          ...line.matchAll(/(?:toast|title=|label=|aria-label=|text=|placeholder=|submitLabel=|body=)\(?["'`{]+([^"'`]*)/g),
        ]
          // A variable called `folder` is not a word on the screen.
          .map((m) => m[1].replace(/\$\{[^}]*\}/g, ""));
        if (shown.some((t) => /\bfolders?\b/i.test(t))) offenders.push(`${f}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it("the bookmark stays, and says where things go", () => {
    expect(read("src/components/feed/FeedCard.tsx")).toContain("In your Library. Tap for playlists, hold to file");
    expect(read("src/components/shots/ReelsFeed.tsx")).toContain("In your Library. Tap for playlists, hold to file");
    expect(read("src/components/feed/FeedCard.tsx")).toContain("<Bookmark");
  });

  it("an invitation's notification opens the Library", () => {
    expect(read("src/app/(app)/notifications/page.tsx")).toContain('if (n.type === "playlist_invite") return "/library";');
  });

  it("only its owner is offered Delete; someone who joined cannot open one they only were invited to", () => {
    const screen = read("src/components/saved/FolderScreen.tsx");
    expect(screen).toMatch(/onDelete=\{\s*owner\s*\?/);
    expect(read("src/app/(app)/collections/[collectionId]/page.tsx")).toContain(
      'if (role !== "owner" && role !== "editor") redirect("/library");',
    );
  });
});

describe("invitations at the top of the Library", () => {
  const rpc = vi.fn();
  const toast = vi.fn();
  let root: Root;
  let host: HTMLDivElement;
  const onJoined = vi.fn();
  const invite = {
    playlistId: "p1",
    name: "Late night edits",
    emoji: null,
    itemCount: 9,
    owner: { id: "", name: "Maya", username: "maya", hue: 20, avatarUrl: null },
  };

  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    for (const m of [rpc, toast, onJoined]) m.mockReset();
    rpc.mockResolvedValue({ data: null, error: null });
    vi.doMock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc }) }));
    vi.doMock("@/components/ui/ToastProvider", () => ({ useToast: () => toast }));
    vi.doMock("@/lib/haptics", () => ({ haptics: { success: () => {}, select: () => {} } }));
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const { PlaylistInvites } = await import("@/components/saved/PlaylistInvites");
    await act(async () => root.render(createElement(PlaylistInvites, { initial: [invite], onJoined })));
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.resetModules();
  });

  const button = (label: string) => [...host.querySelectorAll("button")].find((b) => b.textContent === label)!;
  const press = (label: string) =>
    act(async () => {
      button(label).click();
      await new Promise((r) => setTimeout(r, 5));
    });

  it("says who invited you to what", () => {
    expect(host.textContent).toContain("Late night edits");
    expect(host.textContent).toContain("@maya invited you");
  });

  it("joining accepts it, takes the card away and refreshes the shelf", async () => {
    await press("Join");
    expect(rpc).toHaveBeenCalledWith("respond_playlist_invite", { p_collection: "p1", p_accept: true });
    expect(host.querySelector("[data-playlist-invites]")).toBeNull();
    expect(onJoined).toHaveBeenCalledTimes(1);
  });

  it("declining takes it away quietly and adds nothing to the shelf", async () => {
    await press("Decline");
    expect(rpc).toHaveBeenCalledWith("respond_playlist_invite", { p_collection: "p1", p_accept: false });
    expect(host.querySelector("[data-playlist-invites]")).toBeNull();
    expect(onJoined).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it("an invitation that was withdrawn says so and goes", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "That invitation is gone" } });
    await press("Join");
    expect(toast).toHaveBeenCalledWith("That invitation is gone", "error");
    expect(host.querySelector("[data-playlist-invites]")).toBeNull();
    expect(onJoined).not.toHaveBeenCalled();
  });
});
