// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { CreationDraft } from "@/lib/creation-drafts";

/**
 * Leaving the creator with a clip in hand.
 *
 * Back used to leave the whole screen from anywhere in it and the clip went
 * with it, unasked. Now Back goes one step, and the step that would lose the
 * clip asks first: save it as a draft, discard it, or stay.
 *
 * And the two controls that are not built yet, Live and Effects, say so when
 * tapped instead of doing nothing.
 */

const nav = vi.hoisted(() => ({ left: 0, replaced: [] as string[], redirect: vi.fn() }));
const overlay = vi.hoisted(() => ({ back: () => {} }));
const toasts = vi.hoisted(() => [] as string[]);
const shelf = vi.hoisted(() => ({
  kept: [] as CreationDraft[],
  result: "saved" as "saved" | "full" | "failed",
  deleted: [] as string[],
}));
const stage = vi.hoisted(() => ({ editorInitial: undefined as unknown, previewCaption: undefined as unknown }));

vi.mock("next/navigation", () => ({
  redirect: nav.redirect,
  useRouter: () => ({ push() {}, replace: (to: string) => nav.replaced.push(to), refresh() {}, back() {} }),
}));
vi.mock("@/lib/safe-back", () => ({ safeBack: () => { nav.left += 1; } }));
vi.mock("@/lib/haptics", () => ({ haptics: { tap() {}, select() {}, success() {} } }));
vi.mock("@/components/ui/ToastProvider", () => ({ useToast: () => (msg: string) => { toasts.push(msg); } }));
vi.mock("@/lib/overlay-stack", () => ({
  useOverlayBackButton: (_open: boolean, onClose: () => void) => { overlay.back = onClose; },
}));
vi.mock("@/lib/useCamera", () => ({
  useCamera: () => ({ streamRef: { current: null }, videoRef: { current: null }, ready: false, error: null, retry() {}, flip() {}, snapshot: () => null, capturePhoto: async () => null, isLandscape: false, mirrored: false }),
}));
vi.mock("@/lib/useVideoRecorder", () => ({
  useVideoRecorder: () => ({ unsupported: false, recording: false, progress: 0, start() {}, stop() {} }),
}));
vi.mock("@/components/music/TrackPicker", () => ({ TrackPicker: () => null }));
vi.mock("@/lib/video-poster", async (orig) => ({ ...(await orig<object>()), capturePoster: async () => null }));
vi.mock("@/lib/creation-drafts", () => ({
  MAX_DRAFTS: 5,
  listDrafts: async () => [...shelf.kept],
  saveDraft: async (d: CreationDraft) => {
    if (shelf.result === "saved") shelf.kept = [d, ...shelf.kept.filter((k) => k.id !== d.id)];
    return shelf.result;
  },
  deleteDraft: async (id: string) => {
    shelf.deleted.push(id);
    shelf.kept = shelf.kept.filter((k) => k.id !== id);
  },
}));

const EDIT = { duration: 20, trim: { start: 2, end: 14 }, coverTime: 5 };

vi.mock("@/components/create/ShotEditor", () => ({
  ShotEditor: (p: { initial?: unknown; onEdit?: (e: typeof EDIT) => void; onBack: () => void; onNext: (e: typeof EDIT) => void }) => {
    stage.editorInitial = p.initial;
    return createElement(
      "div",
      { "data-stage": "edit" },
      createElement("button", { onClick: () => p.onEdit?.(EDIT) }, "trim it"),
      createElement("button", { onClick: p.onBack }, "editor back"),
      createElement("button", { onClick: () => p.onNext(EDIT) }, "editor next"),
    );
  },
}));
vi.mock("@/components/create/ShotPreview", () => ({
  ShotPreview: (p: { initialCaption?: string; onCaptionChange?: (c: string) => void; onBack: () => void; onDone: () => void }) => {
    stage.previewCaption = p.initialCaption;
    return createElement(
      "div",
      { "data-stage": "caption" },
      createElement("button", { onClick: () => p.onCaptionChange?.("roof at dusk") }, "write caption"),
      createElement("button", { onClick: p.onBack }, "caption back"),
      createElement("button", { onClick: p.onDone }, "publish"),
    );
  },
}));

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.URL.createObjectURL ??= () => "blob:x";
  globalThis.URL.revokeObjectURL ??= () => {};
  nav.left = 0;
  nav.replaced.length = 0;
  nav.redirect.mockReset();
  toasts.length = 0;
  shelf.kept = [];
  shelf.result = "saved";
  shelf.deleted.length = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
  vi.useRealTimers();
});

const at = () => host.querySelector("[data-stage]")?.getAttribute("data-stage") ?? "pick";
const asking = () => document.querySelector('[role="dialog"]');
const tap = (label: string) =>
  act(async () => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.trim() === label);
    if (!b) throw new Error(`no button "${label}"`);
    (b as HTMLButtonElement).click();
  });
const hardwareBack = () => act(async () => overlay.back());

async function open(props: Record<string, unknown> = {}) {
  const { CreateScreen } = await import("@/components/create/CreateScreen");
  await act(async () => root.render(createElement(CreateScreen, { userId: "me", ...props } as never)));
}
async function pickClip(name = "clip.mp4", type = "video/mp4") {
  const input = host.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [new File(["x"], name, { type })], configurable: true });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
}

describe("Back, with a clip in hand", () => {
  it("asks before the clip is lost, and staying keeps it", async () => {
    await open();
    await pickClip();
    await tap("editor back");
    expect(asking()?.getAttribute("aria-label")).toBe("Leave this Shot?");
    await tap("Keep editing");
    expect(asking()).toBeNull();
    expect(at()).toBe("edit");
    expect(nav.left).toBe(0);
  });

  it("goes back one step from the caption, with the edit as it was left", async () => {
    await open();
    await pickClip();
    await tap("editor next");
    expect(at()).toBe("caption");
    await hardwareBack();
    // On the editor, not out of the creator, and not asked: nothing is lost.
    expect(at()).toBe("edit");
    expect(asking()).toBeNull();
    expect(nav.left).toBe(0);
    expect(stage.editorInitial).toEqual(EDIT);
  });

  it("closes the question first, and only leaves the creator from the start", async () => {
    await open();
    await pickClip();
    await hardwareBack();
    expect(asking()).not.toBeNull();
    await hardwareBack();
    expect(asking()).toBeNull();
    expect(at()).toBe("edit");

    await tap("editor back");
    await tap("Discard");
    expect(at()).toBe("pick");
    expect(shelf.kept).toEqual([]);
    await hardwareBack();
    expect(nav.left).toBe(1);
  });

  it("asks about a Show too, by its own name", async () => {
    await open({ initialMode: "show" });
    await pickClip("sky.jpg", "image/jpeg");
    expect(at()).toBe("caption");
    await tap("caption back");
    expect(asking()?.getAttribute("aria-label")).toBe("Leave this Show?");
  });
});

describe("a draft", () => {
  it("keeps the clip, the edit and the words, and shows up to pick back up", async () => {
    await open();
    await pickClip();
    await tap("editor next");
    await tap("write caption");
    await tap("caption back");
    await tap("editor back");
    await tap("Save draft");

    expect(at()).toBe("pick");
    expect(toasts).toContain("Saved to drafts");
    expect(shelf.kept).toHaveLength(1);
    expect(shelf.kept[0]).toMatchObject({ userId: "me", mode: "shot", caption: "roof at dusk", edit: EDIT });
    expect(shelf.kept[0].file.name).toBe("clip.mp4");
    expect(host.querySelectorAll("[data-drafts] [aria-label^='Continue draft']")).toHaveLength(1);
  });

  it("keeps the edit as it stands when saved straight from the editor", async () => {
    await open();
    await pickClip();
    await tap("trim it");
    await tap("editor back");
    await tap("Save draft");
    expect(shelf.kept[0].edit).toEqual(EDIT);
  });

  it("opens where it was left, and is cleared away once it is posted", async () => {
    shelf.kept = [
      { id: "d1", userId: "me", mode: "shot", file: new File(["x"], "old.mp4", { type: "video/mp4" }), thumb: null, track: null, edit: EDIT, caption: "from before", savedAt: Date.now() },
    ];
    await open();
    await act(async () => (host.querySelector("[aria-label^='Continue draft']") as HTMLButtonElement).click());
    expect(at()).toBe("caption");
    expect(stage.previewCaption).toBe("from before");

    await tap("publish");
    expect(shelf.deleted).toEqual(["d1"]);
    expect(nav.replaced).toEqual(["/shots"]);
  });

  it("is deleted, not duplicated, when one opened from the shelf is thrown away", async () => {
    shelf.kept = [
      { id: "d1", userId: "me", mode: "shot", file: new File(["x"], "old.mp4", { type: "video/mp4" }), thumb: null, track: null, edit: null, caption: "", savedAt: Date.now() },
    ];
    await open();
    await act(async () => (host.querySelector("[aria-label^='Continue draft']") as HTMLButtonElement).click());
    expect(at()).toBe("edit");
    await tap("editor back");
    // Saving again writes over the same draft.
    expect([...document.querySelectorAll("[role=dialog] button")].map((b) => b.textContent)).toEqual([
      "Save changes", "Delete draft", "Keep editing",
    ]);
    await tap("Delete draft");
    expect(shelf.deleted).toEqual(["d1"]);
    expect(host.querySelector("[data-drafts]")).toBeNull();
  });

  it("can be thrown away from the shelf without opening it", async () => {
    shelf.kept = [
      { id: "d1", userId: "me", mode: "shot", file: new File(["x"], "old.mp4", { type: "video/mp4" }), thumb: null, track: null, edit: null, caption: "", savedAt: Date.now() },
    ];
    await open();
    await act(async () => (host.querySelector('[aria-label="Delete draft"]') as HTMLButtonElement).click());
    expect(shelf.deleted).toEqual(["d1"]);
    expect(host.querySelector("[data-drafts]")).toBeNull();
  });

  it("says so, and keeps the clip in hand, when the shelf is full or the device refuses", async () => {
    await open();
    await pickClip();
    shelf.result = "full";
    await tap("editor back");
    await tap("Save draft");
    expect(toasts.at(-1)).toBe("You have 5 drafts. Delete one to save another.");
    expect(at()).toBe("edit");

    shelf.result = "failed";
    await tap("editor back");
    await tap("Save draft");
    expect(toasts.at(-1)).toBe("This device couldn't store the draft.");
    expect(at()).toBe("edit");
  });

  it("lists a Show's drafts under Show and a Shot's under Shot", async () => {
    shelf.kept = [
      { id: "s1", userId: "me", mode: "show", file: new File(["x"], "sky.jpg", { type: "image/jpeg" }), thumb: null, track: null, edit: null, caption: "", savedAt: Date.now() },
    ];
    await open();
    expect(host.querySelector("[data-drafts]")).toBeNull();
    await tap("Show");
    expect(host.querySelectorAll("[data-drafts] [aria-label^='Continue draft']")).toHaveLength(1);
  });
});

describe("what is not built yet", () => {
  const note = () => host.querySelector('[role="status"]')?.textContent ?? null;
  const pressed = () =>
    [...host.querySelectorAll('button[aria-pressed="true"]')].map((b) => b.textContent?.trim());

  it("says so when Live is tapped, and stays where it was", async () => {
    vi.useFakeTimers();
    await open();
    expect(note()).toBeNull();
    await tap("Live");
    expect(note()).toContain("In development");
    expect(note()).toContain("construction area");
    expect(pressed()).toEqual(["Shot"]);
    // It does not sit there for good.
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(note()).toBeNull();
  });

  it("greets someone who chose Live from the (+) menu with the same note", async () => {
    await open({ askedForLive: true });
    expect(note()).toContain("In development");
    expect(pressed()).toEqual(["Shot"]);
  });

  it("says so when Effects is tapped", async () => {
    await open();
    await tap("Record");
    const effects = host.querySelector('[aria-label="Effects"]') as HTMLButtonElement;
    expect(effects.disabled).toBe(false);
    await act(async () => effects.click());
    expect(note()).toContain("In development");
  });
});

describe("one way to make a Show", () => {
  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) return sources(p);
      return p.endsWith(".tsx") || p.endsWith(".ts") ? [p] : [];
    });
  }

  it("has nothing in the app still linking to the old one", () => {
    const old = sources("src").filter((p) => readFileSync(p, "utf8").includes('"/shows/add"'));
    expect(old).toEqual([]);
  });

  it("sends an old link to the creator, on Show", async () => {
    const { default: AddShowPage } = await import("@/app/(app)/shows/add/page");
    AddShowPage();
    expect(nav.redirect).toHaveBeenCalledWith("/create?mode=show");
  });

  it("offers a song on a Show, which only the old one did", async () => {
    await open({ initialMode: "show" });
    expect(host.textContent).toContain("Add sound");
  });
});
