// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  LEGACY_POST_DRAFT_KEY,
  imageTypeOf,
  isAllowedPostImage,
  postDraftKey,
  postImageUpload,
  scheduleState,
} from "@/lib/post-compose";

/**
 * The post composer's quieter mistakes: a draft that showed up in another
 * account, a schedule that turned into "post now" without saying so, photos
 * dropped by Back, a good photo refused, and a PNG stored as a JPEG.
 */

const nav = vi.hoisted(() => ({ left: 0, pushed: [] as string[] }));
const overlay = vi.hoisted(() => ({ back: () => {} }));
const uploads = vi.hoisted(() => [] as Record<string, unknown>[]);
const picked = vi.hoisted(() => ({ at: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: (to: string) => nav.pushed.push(to), replace() {}, refresh() {}, back() {} }),
}));
vi.mock("@/lib/safe-back", () => ({ safeBack: () => { nav.left += 1; } }));
vi.mock("@/lib/overlay-stack", () => ({
  useOverlayBackButton: (_open: boolean, onClose: () => void) => { overlay.back = onClose; },
}));
vi.mock("@/components/upload/UploadProvider", () => ({
  useUpload: () => ({ uploadPost: (a: Record<string, unknown>) => { uploads.push(a); } }),
}));
vi.mock("@/components/ui/MentionHashtagPicker", () => ({
  useMentionHashtag: () => ({ suggestions: [], reset() {} }),
  applySuggestion: (v: string, c: number) => ({ newValue: v, newCursor: c }),
  SuggestionDropdown: () => null,
}));
vi.mock("@/components/post/TopicSuggestions", () => ({ TopicSuggestions: () => null }));
vi.mock("@/components/post/ImageCropper", () => ({ ImageCropper: () => null }));
vi.mock("@/components/post/PostPreview", () => ({ PostPreview: () => createElement("div", { "data-preview": true }) }));
vi.mock("@/components/music/TrackPicker", () => ({ TrackPicker: () => null }));
vi.mock("@/components/music/TrackChip", () => ({ TrackChip: () => null }));
vi.mock("@/components/post/SchedulePicker", () => ({
  SchedulePicker: (p: { onConfirm: (at: string) => void }) =>
    createElement("button", { onClick: () => p.onConfirm(picked.at) }, "pick the time"),
}));

const local = (ms: number) => {
  const d = new Date(ms);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}`;
};

describe("a picked photo", () => {
  it("is known by its extension when the gallery gives it no type", () => {
    expect(imageTypeOf({ type: "", name: "IMG_2041.JPG" })).toBe("image/jpeg");
    expect(isAllowedPostImage({ type: "", name: "IMG_2041.JPG" })).toBe(true);
    expect(isAllowedPostImage({ type: "", name: "shot.webp" })).toBe(true);
  });

  it("is still refused when it is not a kind a post can carry", () => {
    expect(isAllowedPostImage({ type: "image/gif", name: "a.gif" })).toBe(false);
    expect(isAllowedPostImage({ type: "", name: "notes.pdf" })).toBe(false);
    expect(isAllowedPostImage({ type: "", name: "noextension" })).toBe(false);
  });

  it("is stored as what it is, not always as a JPEG", () => {
    expect(postImageUpload({ type: "image/png", name: "a.png" })).toEqual({ ext: "png", contentType: "image/png" });
    expect(postImageUpload({ type: "image/webp", name: "a.webp" })).toEqual({ ext: "webp", contentType: "image/webp" });
    // A cropped photo is re-encoded, and a typeless one falls back.
    expect(postImageUpload({ type: "image/jpeg", name: "post.jpg" })).toEqual({ ext: "jpg", contentType: "image/jpeg" });
    expect(postImageUpload({ type: "", name: "x" })).toEqual({ ext: "jpg", contentType: "image/jpeg" });
  });
});

describe("a chosen time", () => {
  const now = Date.UTC(2026, 9, 6, 12, 0, 0);
  it("is a schedule while it is still ahead", () => {
    expect(scheduleState(null, now)).toBe("none");
    expect(scheduleState(new Date(now + 60 * 60 * 1000).toISOString(), now)).toBe("ok");
  });
  it("is not quietly 'post now' once it has gone by", () => {
    expect(scheduleState(new Date(now - 60 * 1000).toISOString(), now)).toBe("passed");
    // Too close to be "later" is the same answer.
    expect(scheduleState(new Date(now + 10 * 1000).toISOString(), now)).toBe("passed");
    expect(scheduleState("not a date", now)).toBe("passed");
  });
});

describe("the composer", () => {
  let root: Root;
  let host: HTMLDivElement;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.URL.createObjectURL = () => "blob:photo";
    globalThis.URL.revokeObjectURL = () => {};
    localStorage.clear();
    nav.left = 0;
    nav.pushed.length = 0;
    uploads.length = 0;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    document.body.innerHTML = "";
  });

  const AUTHOR = { name: "Maya", username: "maya", hue: 120, avatarUrl: null };
  async function open(userId = "me") {
    const { PostComposer } = await import("@/components/post/PostComposer");
    await act(async () => root.render(createElement(PostComposer, { userId, author: AUTHOR })));
  }
  const fields = () => [...host.querySelectorAll("textarea")] as HTMLTextAreaElement[];
  async function write(text: string) {
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    await act(async () => {
      set.call(fields()[0], text);
      fields()[0].dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  const tap = (label: string) =>
    act(async () => {
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.trim() === label);
      if (!b) throw new Error(`no button "${label}"`);
      (b as HTMLButtonElement).click();
    });
  async function addPhoto(name: string, type: string) {
    const input = host.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [new File(["x"], name, { type })], configurable: true });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  }

  it("keeps each account's draft to that account", async () => {
    localStorage.setItem(LEGACY_POST_DRAFT_KEY, JSON.stringify({ caption: "from whoever was here" }));
    localStorage.setItem(postDraftKey("someone-else"), JSON.stringify({ caption: "theirs" }));
    await open("me");
    expect(fields().map((f) => f.value).join("")).toBe("");
    expect(host.textContent).not.toContain("Draft restored");
    // The shared one is gone; the other account's is untouched.
    expect(localStorage.getItem(LEGACY_POST_DRAFT_KEY)).toBeNull();
    expect(localStorage.getItem(postDraftKey("someone-else"))).toContain("theirs");

    await write("mine");
    expect(localStorage.getItem(postDraftKey("me"))).toContain("mine");
  });

  it("brings your own draft back, poll and all", async () => {
    localStorage.setItem(postDraftKey("me"), JSON.stringify({ caption: "tea or coffee", poll: ["tea", "coffee"] }));
    await open("me");
    expect(host.textContent).toContain("Draft restored");
    expect(fields()[0].value).toBe("tea or coffee");
    const options = [...host.querySelectorAll("input")].map((i) => (i as HTMLInputElement).value);
    expect(options).toEqual(expect.arrayContaining(["tea", "coffee"]));
  });

  it("schedules a post for a time that is still ahead", async () => {
    picked.at = local(Date.now() + 2 * 60 * 60 * 1000);
    await open();
    await write("later");
    await tap("pick the time");
    await tap("Schedule");
    expect(uploads).toHaveLength(1);
    expect(uploads[0].scheduledAt).toBe(new Date(picked.at).toISOString());
    expect(nav.pushed).toEqual(["/create/scheduled"]);
  });

  it("does not post now when the chosen time has gone by: it says so", async () => {
    picked.at = local(Date.now() - 5 * 60 * 1000);
    await open();
    await write("meant for later");
    await tap("pick the time");
    // Still a schedule on the button, because a time is still chosen.
    await tap("Schedule");
    expect(uploads).toHaveLength(0);
    expect(nav.pushed).toEqual([]);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("That time has passed");

    // Removing the schedule is how you post now.
    await act(async () => (host.querySelector('[aria-label="Cancel schedule"]') as HTMLButtonElement).click());
    expect(host.querySelector('[role="alert"]')).toBeNull();
    await tap("Post");
    expect(uploads).toHaveLength(1);
    expect(uploads[0].scheduledAt).toBeNull();
  });

  it("takes a photo the gallery gave no type to", async () => {
    await open();
    await addPhoto("IMG_2041.jpg", "");
    expect(host.textContent).not.toContain("Only JPEG, PNG, and WebP");
    expect(host.querySelectorAll('img[src="blob:photo"]').length).toBeGreaterThan(0);
  });

  it("asks before Back drops your photos, and not when there are none", async () => {
    await open();
    await write("just words");
    await act(async () => overlay.back());
    // Words are drafted on their own: nothing to ask.
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(nav.left).toBe(1);

    await addPhoto("a.jpg", "image/jpeg");
    await act(async () => overlay.back());
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Your photo is not");
    expect(nav.left).toBe(1);
    await tap("Keep editing");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => overlay.back());
    await tap("Leave");
    expect(nav.left).toBe(2);
  });

  it("steps back from the preview to the composer, not out of it", async () => {
    await open();
    await write("hello");
    await tap("Preview");
    expect(host.querySelector("[data-preview]")).not.toBeNull();
    await act(async () => overlay.back());
    expect(host.querySelector("[data-preview]")).toBeNull();
    expect(nav.left).toBe(0);
  });
});
