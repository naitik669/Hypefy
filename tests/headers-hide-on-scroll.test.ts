import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { DOWN, FREE_ZONE, UP } from "@/lib/use-hide-on-scroll";

/**
 * Every header gets out of the way, not just Home's.
 *
 * One hook rather than a copy per header. Thirty-three routes draw their
 * header through PageHeader, so that is one change; four screens have a
 * header of their own — Messages, Saved, a folder, Search — and Home's bar
 * is a server component wrapped in HideOnScroll. Five callers, one set of
 * rules, because three copies of a scroll listener drift the moment one
 * threshold is tuned.
 *
 * The back arrow hides with the header. On Android the hardware button is
 * the way out regardless; elsewhere a few pixels of upward scroll brings it
 * back. That trade was made deliberately — see the PR.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const hook = read("src/lib/use-hide-on-scroll.ts");
const pageHeader = read("src/components/ui/PageHeader.tsx");

function tsxFiles(dir = "src"): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsxFiles(p));
    else if (name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/** Headers that stay put, each for its own reason. */
const PINNED = new Set([
  // Static pages with their own layout chrome.
  "src/app/(legal)/layout.tsx",
  // A progress bar through setup, not a header.
  "src/components/onboarding/SetupStepper.tsx",
  // A zero-height positioning anchor for the chat backdrop.
  "src/components/messages/ChatAmbient.tsx",
  // Loading placeholders, never scrolled and never interactive.
  "src/components/skeletons/Skeletons.tsx",
  "src/components/skeletons/TabSkeleton.tsx",
]);

describe("one set of rules", () => {
  it("lives in the hook, not in each header", () => {
    expect(hook).toContain("export function useHideOnScroll()");
    expect(hook).toContain("export function hideStyle(");
  });

  it("and every hiding header reads it", () => {
    for (const f of [
      "src/components/ui/PageHeader.tsx",
      "src/components/messages/MessagesHeader.tsx",
      "src/components/saved/SavedScreen.tsx",
      "src/components/saved/FolderScreen.tsx",
      "src/app/(app)/search/page.tsx",
      "src/components/layout/HideOnScroll.tsx",
    ]) {
      expect(read(f), f).toContain("useHideOnScroll(");
      expect(read(f), f).toContain("hideStyle(");
    }
  });

  it("nobody keeps a private copy of the listener", () => {
    // The whole point of the hook. A second scroll listener in a header
    // would drift from these thresholds the first time one was tuned.
    // Quote-agnostic: the first version of this looked for a double-quoted
    // "scroll" only, and a single-quoted copy walked straight past it.
    const listener = /addEventListener\(\s*['"`]scroll['"`]/;
    const slide = /translateY\(-100%\)/;
    const copies = tsxFiles().filter((f) => {
      const s = read(f);
      return listener.test(s) && slide.test(s);
    });
    expect(copies, copies.join(", ")).toEqual([]);
  });

  it("coming back takes less movement than going away", () => {
    // Somebody reaching for the header flicks rather than scrolls.
    expect(UP).toBeGreaterThan(0);
    expect(UP).toBeLessThan(DOWN);
    expect(FREE_ZONE).toBeGreaterThan(DOWN);
  });
});

describe("the shared header covers most of the app", () => {
  it("PageHeader hides, so every route drawing through it does", () => {
    expect(pageHeader).toContain("const hidden = useHideOnScroll();");
    expect(pageHeader).toContain("style={hideStyle(hidden)}");
  });

  it("with no opt-out, because no caller needed one", () => {
    // The composer was the case I expected to need pinning. Its header holds
    // a title and a back arrow and nothing else.
    expect(pageHeader).not.toContain("pinned");
    expect(read("src/components/post/PostComposer.tsx")).not.toContain("right=");
  });

  it("and it reaches the screens that were asked for by name", () => {
    for (const f of [
      "src/app/(app)/settings/page.tsx",
      "src/app/(app)/activity/page.tsx",
      "src/app/(app)/help/page.tsx",
      "src/app/(app)/discover/page.tsx",
    ]) {
      expect(read(f), f).toContain("<PageHeader");
    }
  });
});

describe("what stays put", () => {
  it("every sticky header either hides or is on the list of exceptions", () => {
    const stuck = tsxFiles().filter((f) => read(f).includes("sticky top-0"));
    const notHiding = stuck
      .map((f) => f.split("\\").join("/"))
      .filter((f) => {
        const s = read(f);
        return !s.includes("useHideOnScroll") && !s.includes("hideStyle");
      });
    expect(notHiding.sort(), notHiding.join(", ")).toEqual([...PINNED].sort());
  });
});
