import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { byMonth, bySender, fileSize, isSharedTab, linksIn, monthLabel, sortShared, type SharedRow } from "@/lib/chat-shared";

/**
 * What has been shared in a chat, sorted into the three places it is looked
 * for, and the chat details screen that leads there.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const row = (over: Partial<SharedRow>): SharedRow => ({ id: "m1", kind: "text", body: null, sender_id: "a", created_at: "2026-10-05T10:00:00Z", ...over });

describe("sorting what was shared", () => {
  it("photos, videos and GIFs are media", () => {
    const s = sortShared([row({ kind: "image", body: "u1" }), row({ id: "m2", kind: "video", body: "u2" }), row({ id: "m3", kind: "gif", body: "u3" })]);
    expect(s.media.map((m) => [m.kind, m.url])).toEqual([["image", "u1"], ["video", "u2"], ["gif", "u3"]]);
    expect(s.posts).toEqual([]);
    expect(s.more).toEqual([]);
  });

  it("a folder of photos shows each of them, and they remember the message they came in", () => {
    const body = JSON.stringify({ caption: "", items: [{ url: "a", type: "image" }, { url: "b", type: "video" }] });
    const s = sortShared([row({ id: "alb", kind: "album", body })]);
    expect(s.media.map((m) => [m.id, m.messageId, m.kind])).toEqual([["alb-0", "alb", "image"], ["alb-1", "alb", "video"]]);
  });

  it("a shared post carries its picture and who made it", () => {
    const s = sortShared([row({ kind: "post", post_id: "p1", post: { id: "p1", image_url: "old", image_urls: ["first", "second"], profiles: { username: "riya" } } })]);
    expect(s.posts[0]).toMatchObject({ kind: "post", targetId: "p1", thumb: "first", username: "riya" });
  });

  it("a shared Shot uses its poster, or its own first frame when it has none", () => {
    const s = sortShared([
      row({ kind: "shot", shot: { id: "s1", media_url: "clip.mp4", poster_url: "poster.jpg", profiles: [{ username: "dev" }] } }),
      row({ id: "m2", kind: "shot", shot: { id: "s2", media_url: "clip.mp4", poster_url: null } }),
      row({ id: "m3", kind: "shot", shot: { id: "s3", media_url: "still.jpg", poster_url: null } }),
    ]);
    expect(s.posts[0]).toMatchObject({ targetId: "s1", thumb: "poster.jpg", video: null, username: "dev" });
    expect(s.posts[1]).toMatchObject({ thumb: null, video: "clip.mp4" });
    expect(s.posts[2]).toMatchObject({ thumb: "still.jpg", video: null });
  });

  it("a post that is gone is still listed, with nowhere to go", () => {
    const s = sortShared([row({ kind: "post", post_id: "p1", post: null })]);
    expect(s.posts[0].targetId).toBeNull();
  });

  it("a voice note is unpacked, and an old one that is just a link still plays", () => {
    const s = sortShared([
      row({ kind: "voice", body: JSON.stringify({ url: "v.webm", duration: 5, peaks: [0, 1] }) }),
      row({ id: "m2", kind: "voice", body: "https://x/old.webm" }),
    ]);
    expect(s.more[0]).toMatchObject({ kind: "voice", url: "v.webm", duration: 5, peaks: [0, 1] });
    expect(s.more[1]).toMatchObject({ kind: "voice", url: "https://x/old.webm" });
  });

  it("a document keeps its name and size", () => {
    const s = sortShared([row({ kind: "document", body: JSON.stringify({ url: "d.pdf", name: "Notes.pdf", size: 2048 }) })]);
    expect(s.more[0]).toMatchObject({ kind: "file", url: "d.pdf", name: "Notes.pdf", size: 2048 });
  });

  it("links are found inside ordinary messages; a message with none adds nothing", () => {
    const s = sortShared([row({ body: "look https://www.youtube.com/watch?v=1. and https://hypefy.chat/u/a" }), row({ id: "m2", body: "no links here" })]);
    expect(s.more.map((l) => (l.kind === "link" ? [l.host, l.url] : null))).toEqual([
      ["youtube.com", "https://www.youtube.com/watch?v=1"],
      ["hypefy.chat", "https://hypefy.chat/u/a"],
    ]);
  });

  it("anything else (system lines, replies to pages, view-once photos) is left out", () => {
    const s = sortShared([row({ kind: "system", body: "x" }), row({ kind: "oneshot" }), row({ kind: "page_reply", body: "https://a.b" })]);
    expect(s).toEqual({ media: [], posts: [], more: [] });
  });
});

describe("links in a message", () => {
  it("each once, without the punctuation that ended the sentence", () => {
    expect(linksIn("https://a.com/x, https://a.com/x! (https://b.org/y)")).toEqual([
      { url: "https://a.com/x", host: "a.com" },
      { url: "https://b.org/y", host: "b.org" },
    ]);
  });
  it("nothing for nothing", () => {
    expect(linksIn(null)).toEqual([]);
    expect(linksIn("http:// nope")).toEqual([]);
  });
});

describe("narrowing and grouping", () => {
  const items = [
    { senderId: "me", at: "2026-10-05T10:00:00Z" },
    { senderId: "a", at: "2026-10-01T10:00:00Z" },
    { senderId: "a", at: "2026-09-20T10:00:00Z" },
    { senderId: "me", at: "2025-12-20T10:00:00Z" },
  ];
  const now = new Date("2026-10-07T00:00:00Z");

  it("by who sent it", () => {
    expect(bySender(items, "all", "me")).toHaveLength(4);
    expect(bySender(items, "mine", "me")).toHaveLength(2);
    expect(bySender(items, "theirs", "me").every((i) => i.senderId === "a")).toBe(true);
  });

  it("by month, with the year only when it is not this one", () => {
    expect(byMonth(items, now).map((g) => [g.label, g.items.length])).toEqual([["October", 2], ["September", 1], ["December 2025", 1]]);
    expect(monthLabel("not a date", now)).toBe("");
  });

  it("file sizes read as sizes", () => {
    expect(fileSize(1_340_000)).toBe("1.3 MB");
    expect(fileSize(2048)).toBe("2 KB");
    expect(fileSize(undefined)).toBe("");
  });

  it("only the three tabs are tabs", () => {
    expect(isSharedTab("posts")).toBe(true);
    expect(isSharedTab("files")).toBe(false);
    expect(isSharedTab(undefined)).toBe(false);
  });
});

describe("the chat details screen", () => {
  const info = read("src/components/messages/ConversationInfo.tsx");

  it("block, report and delete are in the menu beside the name, and nowhere else", () => {
    const menu = info.slice(info.indexOf("<FloatingMenu"), info.indexOf("</FloatingMenu>"));
    expect(info).toContain('aria-label="More options"');
    for (const piece of ["icon={Ban}", "icon={Flag}", "icon={isGroup ? LogOut : Trash2}"]) expect(menu).toContain(piece);
    expect(info.split("setConfirmBlock(true)").length).toBe(2);
    expect(info.split("setReportOpen(true)").length).toBe(2);
    expect(info.split("removeChat({").length).toBe(2);
  });

  it("the shared tabs are icons that open in place, and fold away when tapped again", () => {
    expect(info).toContain("SHARED_TAB_ICONS.map(({ id, label, Icon }) => {");
    expect(info).toContain("aria-label={`${label}, ${shared[id].length}`}");
    expect(info).toContain("onClick={() => openShared(id)}");
    expect(info).toContain("<SharedPanel shared={shared} me={currentUserId} people={people} isGroup={isGroup} tab={sharedTab} />");
    // It does not leave the screen to do it.
    expect(info).not.toContain("/media?tab=");
  });

  it("it opens beneath the icons: the page is not moved, and nothing below is hidden", () => {
    expect(info).toContain("const openShared = (tab: SharedTab) => setSharedTab((now) => (now === tab ? null : tab));");
    expect(info).not.toContain("scrollIntoView");
    expect(info).not.toContain("{!sharedTab && (");
    // Inside the card, under the tabs.
    const card = info.slice(info.indexOf("data-shared-card"), info.indexOf("data-privacy"));
    expect(card.indexOf("<SharedPanel")).toBeGreaterThan(card.indexOf('role="tablist"'));
  });

  it("privacy is one list: the timer shows its value and opens its choices, the other two are switches", () => {
    expect(info.split("<PrivacyRow").length).toBe(4);
    expect(info).toContain('role={isSwitch ? "switch" : undefined}');
    expect(info).toContain("onClick={() => setTimerOpen(true)}");
    expect(info).toContain('<BottomSheet open={timerOpen} onClose={() => setTimerOpen(false)} title="Disappearing messages">');
    // The timer still asks before it deletes history that already exists.
    expect(info).toContain("if (o.value) setConfirmAutoDelete(o.value);");
  });

  it("the Shared screen holds the same panel under the same icons, and its viewer names the real sender", () => {
    const media = read("src/components/messages/ConversationMedia.tsx");
    expect(media).toContain('role="tablist"');
    expect(media).toContain("aria-label={`${label}, ${count}`}");
    expect(media).toContain("<SharedPanel shared={shared} me={me} people={people} isGroup={isGroup} tab={tab} />");
    expect(media).toContain("avatarUrl: people[open.senderId]?.avatarUrl ?? null");
    expect(media).toContain("<VoiceMessage");
  });

  it("the page opens on the tab it was asked for", () => {
    expect(read("src/app/(app)/messages/[threadId]/media/page.tsx")).toContain('initialTab={isSharedTab(tab) ? tab : "media"}');
  });
});
