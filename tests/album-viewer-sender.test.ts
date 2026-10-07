import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The full-screen photo viewer shows who sent the photo. It used to show a
 * blank avatar on your own photos and on everyone's in a group, because only
 * the name was handed to it.
 */
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

describe("the sender shown in the photo viewer", () => {
  const chat = read("src/components/messages/RealChatView.tsx");
  const viewer = chat.slice(chat.indexOf("<AlbumViewer"), chat.indexOf("sentAt=", chat.indexOf("<AlbumViewer")));

  it("your own photo carries your own picture", () => {
    expect(viewer).toContain('{ name: "You", hue: self?.hue, avatarUrl: self?.avatarUrl ?? null }');
  });

  it("in a group, the member who sent it carries theirs", () => {
    expect(viewer).toContain("avatarUrl: members?.[albumView.senderId]?.avatarUrl ?? null");
  });

  it("the page hands the reader's own picture to the chat", () => {
    const page = read("src/app/(app)/messages/[threadId]/page.tsx");
    expect(page).toContain("self={{ hue: mineProfile?.avatar_hue ?? 280, avatarUrl: mineProfile?.avatar_url ?? null }}");
  });
});
