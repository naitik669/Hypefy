// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { usernameFromName } from "@/lib/username-seed";
import { pickProblem } from "@/lib/pick-check";

/**
 * Two places a new person could get stuck or be surprised:
 *
 * Choosing a username: the field came filled in from their email address
 * and was never checked, so Next stayed off with no reason given.
 *
 * Making a Shot: there were two composers that behaved differently, the
 * cover was asked for twice, and a file that could never upload was only
 * refused at the Post button.
 */

const redirect = vi.hoisted(() => vi.fn());
const taken = vi.hoisted(() => ({ names: new Set<string>(), asked: [] as string[] }));
const shown = vi.hoisted(() => ({ editor: 0, preview: [] as Record<string, unknown>[] }));

vi.mock("next/navigation", () => ({
  redirect,
  useRouter: () => ({ push() {}, replace() {}, refresh() {}, back() {} }),
}));
vi.mock("@/lib/haptics", () => ({ haptics: { tap() {}, select() {}, success() {} } }));
vi.mock("@/app/setup-profile/actions", () => ({ saveProfile: async () => undefined }));
vi.mock("@/components/post/ImageCropper", () => ({ ImageCropper: () => null }));
vi.mock("@/components/ui/ToastProvider", () => ({ useToast: () => () => {} }));
vi.mock("@/components/upload/UploadProvider", () => ({ useUpload: () => ({ uploadShot() {} }) }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: (_c: string, name: string) => ({
          maybeSingle: async () => {
            taken.asked.push(name);
            return { data: taken.names.has(name) ? { id: "someone-else" } : null };
          },
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/useCamera", () => ({
  useCamera: () => ({ streamRef: { current: null }, videoRef: { current: null }, ready: false, error: null, retry() {}, flip() {}, snapshot: () => null, capturePhoto: async () => null, isLandscape: false, mirrored: false }),
}));
vi.mock("@/lib/useVideoRecorder", () => ({
  useVideoRecorder: () => ({ unsupported: false, recording: false, progress: 0, start() {}, stop() {} }),
}));
vi.mock("@/lib/overlay-stack", () => ({ useOverlayBackButton: () => {} }));
vi.mock("@/components/music/TrackPicker", () => ({ TrackPicker: () => null }));
vi.mock("@/components/create/ShotEditor", () => ({
  ShotEditor: () => {
    shown.editor += 1;
    return createElement("div", { "data-stage": "edit" });
  },
}));

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  redirect.mockReset();
  taken.names.clear();
  taken.asked.length = 0;
  shown.editor = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
  vi.useRealTimers();
});

const button = (label: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent?.trim().startsWith(label)) as HTMLButtonElement;

function type(input: HTMLInputElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  set.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

const BLANK = { displayName: "", username: "", avatarHue: 280, avatarUrl: null, bio: "", tags: [] };

describe("a first username", () => {
  it("comes from the name they chose to show", () => {
    expect(usernameFromName("Maya Rao")).toBe("mayarao");
    expect(usernameFromName("Zoë  O'Neil")).toBe("zoeoneil");
    expect(usernameFromName(".dot.")).toBe("dot");
    expect(usernameFromName("A Very Long Name That Keeps On Going")).toHaveLength(20);
  });

  it("is nothing at all when the name leaves too little to go on", () => {
    expect(usernameFromName("Al")).toBe("");
    expect(usernameFromName("मीरा")).toBe("");
  });

  it("is never taken from the email address", () => {
    const page = readFileSync("src/app/setup-profile/page.tsx", "utf8");
    expect(page).not.toContain("user.email");
  });
});

describe("the username step", () => {
  it("checks a name that is already there, so Next is not stuck", async () => {
    const { SetupStepper } = await import("@/components/onboarding/SetupStepper");
    await act(async () =>
      root.render(createElement(SetupStepper, { userId: "me", initial: { ...BLANK, displayName: "Maya", username: "maya" } })),
    );
    expect(taken.asked).toEqual(["maya"]);
    await act(async () => button("Next").click());
    // On the username step, with nothing typed: free, and Next works.
    expect(host.textContent).toContain("that one's free");
    expect(button("Next").disabled).toBe(false);
  });

  it("says so when the name that is already there belongs to someone else", async () => {
    taken.names.add("maya");
    const { SetupStepper } = await import("@/components/onboarding/SetupStepper");
    await act(async () =>
      root.render(createElement(SetupStepper, { userId: "me", initial: { ...BLANK, displayName: "Maya", username: "maya" } })),
    );
    await act(async () => button("Next").click());
    expect(host.textContent).toContain("That username is taken.");
    expect(button("Next").disabled).toBe(true);
  });

  it("suggests one from the name just given, and has it checked", async () => {
    vi.useFakeTimers();
    const { SetupStepper } = await import("@/components/onboarding/SetupStepper");
    await act(async () => root.render(createElement(SetupStepper, { userId: "me", initial: BLANK })));
    expect(taken.asked).toEqual([]);
    await act(async () => type(host.querySelector("input")!, "Maya Rao"));
    await act(async () => button("Next").click());
    expect((host.querySelector("input") as HTMLInputElement).value).toBe("mayarao");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(taken.asked).toEqual(["mayarao"]);
    expect(button("Next").disabled).toBe(false);
  });
});

describe("one way to make a Shot", () => {
  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) return sources(p);
      return p.endsWith(".tsx") || p.endsWith(".ts") ? [p] : [];
    });
  }

  it("has nothing in the app still pointing at the old composer", () => {
    const old = sources("src").filter(
      (p) => !p.replace(/\\/g, "/").endsWith("create/shot/page.tsx") && readFileSync(p, "utf8").includes('"/create/shot"'),
    );
    expect(old).toEqual([]);
  });

  it("sends an old link to the creator, on Shot", async () => {
    const { default: CreateShotPage } = await import("@/app/(app)/create/shot/page");
    CreateShotPage();
    expect(redirect).toHaveBeenCalledWith("/create?mode=shot");
  });
});

describe("a file that cannot be used", () => {
  const MB = 1024 * 1024;

  it("is named for what is wrong with it", () => {
    expect(pickProblem({ name: "a.mp4", type: "video/mp4", size: 10 * MB }, "shot")).toBeNull();
    expect(pickProblem({ name: "a.jpg", type: "image/jpeg", size: MB }, "shot")).toMatch(/video/i);
    expect(pickProblem({ name: "a.mkv", type: "video/x-matroska", size: MB }, "shot")).toMatch(/format/);
    expect(pickProblem({ name: "a.mp4", type: "video/mp4", size: 51 * MB }, "shot")).toBe("That's 51MB. Shots can be up to 50MB.");
  });

  it("holds a Show to its own, smaller limit, and lets a photo through", () => {
    expect(pickProblem({ name: "a.jpg", type: "image/jpeg", size: 3 * MB }, "show")).toBeNull();
    expect(pickProblem({ name: "a.mp4", type: "video/mp4", size: 30 * MB }, "show")).toBe("That's 30MB. Shows can be up to 25MB.");
    expect(pickProblem({ name: "a.mp4", type: "video/mp4", size: 30 * MB }, "shot")).toBeNull();
  });

  it("knows a recording and a clip with no type for what they are", () => {
    expect(pickProblem({ name: "r.webm", type: "video/webm;codecs=vp9,opus", size: MB }, "shot")).toBeNull();
    expect(pickProblem({ name: "clip.MOV", type: "", size: MB }, "shot")).toBeNull();
  });

  async function pick(file: File) {
    const input = host.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  }
  const fileOf = (name: string, type: string, mb: number) => {
    const f = new File(["x"], name, { type });
    Object.defineProperty(f, "size", { value: mb * MB });
    return f;
  };

  it("is refused where it was chosen, before any editing", async () => {
    const { CreateScreen } = await import("@/components/create/CreateScreen");
    await act(async () => root.render(createElement(CreateScreen, { userId: "me" })));

    await pick(fileOf("huge.mp4", "video/mp4", 80));
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("That's 80MB. Shots can be up to 50MB.");
    expect(shown.editor).toBe(0);

    // A good one clears the complaint and goes on to the editor.
    await pick(fileOf("fine.mp4", "video/mp4", 8));
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.querySelector('[data-stage="edit"]')).not.toBeNull();
  });
});

describe("the cover", () => {
  it("is chosen once, in the edit step, and not asked for again before posting", async () => {
    globalThis.URL.createObjectURL ??= () => "blob:x";
    globalThis.URL.revokeObjectURL ??= () => {};
    const { ShotPreview } = await import("@/components/create/ShotPreview");
    await act(async () =>
      root.render(
        createElement(ShotPreview, {
          file: new File(["x"], "a.mp4", { type: "video/mp4" }),
          mode: "shot",
          track: null,
          userId: "me",
          edit: { duration: 12, trim: { start: 0, end: 12 }, coverTime: 4 },
          onBack() {},
          onDone() {},
        }),
      ),
    );
    expect(host.textContent).toContain("Post Shot");
    expect(host.textContent).not.toMatch(/cover/i);
  });
});
