import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { GROUP_PHOTO_MAX_BYTES, centredSquare, groupPhotoProblem } from "@/lib/group-photo";

/**
 * The group half of the chat details screen: name and photo changed at the
 * top, members second (a strip that becomes a list), and the reactions list
 * showing each person's own picture.
 */
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

describe("the group on the chat details screen", () => {
  const info = read("src/components/messages/ConversationInfo.tsx");
  const members = info.slice(info.indexOf("data-group-members"), info.indexOf("{/* Shared in this chat"));

  it("the photo and the name are changed where they are shown, by admins", () => {
    expect(info).toContain("{isGroup && isAdmin ? (\n          <label className=\"relative cursor-pointer\" data-group-photo>");
    expect(info).toContain('aria-label="Change group photo"');
    expect(info).toContain('aria-label="Rename group"');
    expect(info).toContain("else void saveName();");
    // The separate "Group name" card is gone.
    expect(info).not.toContain("data-group-name");
    expect(info).not.toContain("Only admins can rename this group.");
  });

  it("a new photo goes into the admin's own folder and is then set on the group", () => {
    expect(info).toContain("const path = `${currentUserId}/group-${conversationId}-${Date.now()}.jpg`;");
    expect(info).toContain("p_avatar_url: url,");
    // If the group refuses it, the file is not left behind.
    expect(info).toContain('await supabase.storage.from("avatars").remove([path]);');
  });

  it("members come second: before what was shared, and before privacy", () => {
    const m = info.indexOf("data-group-members");
    expect(m).toBeGreaterThan(info.indexOf("data-quick-actions"));
    expect(info.indexOf("data-shared-card")).toBeGreaterThan(m);
    expect(info.indexOf("data-privacy")).toBeGreaterThan(info.indexOf("data-shared-card"));
  });

  it("a strip of faces until See all, then the same people as a list", () => {
    expect(members).toContain('{allMembers ? "Show less" : "See all"}');
    expect(members).toContain("inert={allMembers}");
    expect(members).toContain("inert={!allMembers}");
    expect(members).toContain('allMembers ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"');
    expect(members).toContain('allMembers ? "grid-rows-[1fr]" : "grid-rows-[0fr]"');
  });

  it("the rows come down one after another, and hold still for people who asked for less motion", () => {
    expect(members).toContain("transitionDelay: allMembers ? `${Math.min(i, 12) * MEMBER_STAGGER_MS}ms` : \"0ms\",");
    expect(members).toContain('allMembers ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"');
    expect(members.split("motion-reduce:transition-none").length).toBe(4);
  });

  it("what an admin can do to a member is behind that member's dots", () => {
    expect(members).toContain("aria-label={`Options for ${m.name}`}");
    expect(members).toContain('label={m.role === "admin" ? "Make a member" : "Make admin"}');
    expect(members).toContain('label="Remove from group"');
    expect(members).toContain("{isAdmin && m.id !== currentUserId && (");
    expect(members).toContain("setConfirmRemove(m);");
    // The last rows open upward, inside the card that clips the list.
    expect(members).toContain('i >= members.length - 2 ? "bottom-11" : "top-11"');
  });

  it("the actions under the name wear their names, full width", () => {
    const qa = info.slice(info.indexOf("data-quick-actions"), info.indexOf("data-group-members"));
    for (const label of ['label="Chat theme"', 'label="Add people"']) expect(qa).toContain(label);
    expect(qa.split("wide").length - 1).toBe(2);
    const fn = info.slice(info.indexOf("function QuickAction("), info.indexOf("function MaybeProfileLink("));
    expect(fn).toContain('wide ? "w-full gap-2.5 px-4 text-[15px] font-semibold" : "flex-1 justify-center"');
    // Same height whether it is a square or a banner.
    expect(fn).toContain("flex h-12 items-center rounded-2xl");
  });

  it("the face and the name are the way to a profile, so no button says so", () => {
    const qa = info.slice(info.indexOf("data-quick-actions"), info.indexOf("data-group-members"));
    expect(qa).not.toContain("View profile");
    expect(info).toContain("function MaybeProfileLink(");
    // Wrapped around the picture and the name, and only in a DM — a group
    // has no one profile to go to.
    expect(info.split("<MaybeProfileLink username={!isGroup ? peer?.username : null}").length).toBe(3);
    expect(info).toContain("if (!username) return <>{children}</>;");
  });

  it("muting sits with the other things done to a chat, behind the dots", () => {
    // Not a lit square among the actions: it belongs with block, report and
    // delete, which are also done TO a chat rather than in it.
    const qa = info.slice(info.indexOf("data-quick-actions"), info.indexOf("data-group-members"));
    expect(qa).not.toContain("Mute");
    expect(info).toContain('label={isMuted ? "Unmute notifications" : "Mute notifications"}');
    const menu = info.slice(info.indexOf("<FloatingMenu"), info.indexOf("</FloatingMenu>"));
    expect(menu).toContain("icon={isMuted ? BellOff : Bell}");
    // First, and the only one there that destroys nothing.
    expect(menu.indexOf("isMuted ? BellOff : Bell")).toBeLessThan(menu.indexOf("icon={Ban}"));
  });

  it("Add, from the icon or the strip, opens the list with the search ready", () => {
    expect(info).toContain("function startAdding() {\n    setAllMembers(true);\n    setAdding(true);\n  }");
    expect(info.split("onClick={startAdding}").length).toBe(3);
  });
});

describe("a group photo", () => {
  it("is the centred square of whatever was chosen", () => {
    expect(centredSquare(4000, 3000)).toEqual({ sx: 500, sy: 0, side: 3000 });
    expect(centredSquare(1080, 1920)).toEqual({ sx: 0, sy: 420, side: 1080 });
    expect(centredSquare(512, 512)).toEqual({ sx: 0, sy: 0, side: 512 });
    expect(centredSquare(0, 10).side).toBe(0);
  });

  it("must be a picture, and not an enormous one", () => {
    expect(groupPhotoProblem({ type: "image/jpeg", size: 1000 })).toBeNull();
    expect(groupPhotoProblem({ type: "video/mp4", size: 1000 })).toBe("Choose a photo.");
    expect(groupPhotoProblem({ type: "image/png", size: GROUP_PHOTO_MAX_BYTES + 1 })).toContain("too large");
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
