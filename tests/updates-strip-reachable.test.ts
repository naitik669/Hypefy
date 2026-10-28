import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Getting back to UpDates after shutting them.
 *
 * The strip can be collapsed, and the only way to open it again is the
 * arrow beside the tabs. So the arrow must not depend on anything that can
 * go away on its own — and an UpDate expires after 24 hours, so "somebody
 * has posted today" goes away by itself, overnight, with nobody touching
 * anything.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const inbox = read("src/components/messages/MessagesInbox.tsx");
const strip = read("src/components/diary/PagesStrip.tsx");

describe("the arrow is always there to undo the collapse", () => {
  it("it does not depend on there being any updates", () => {
    // This is the bug: with the gate on pages.length, collapsing the strip
    // and waiting a day left no way to open it again, and no way to write
    // your own from Messages at all.
    expect(inbox).not.toContain("{pages.length > 0 && (");
    expect(inbox).toContain('{level === "normal" && (\n          <PagesTrigger');
  });

  it("and the count is what can be absent, not the button", () => {
    // PagesTrigger already draws without a badge at zero, which is why the
    // gate was never needed for the look of it.
    expect(strip).toContain("{count > 0 && (");
    expect(strip).toContain("export function PagesTrigger({");
  });

  it("the arrow and the strip agree about where they belong", () => {
    // Both on the normal inbox. Either one without the other is a control
    // with nothing to control, or a strip nobody can put away.
    expect(inbox).toContain('{level === "normal" && pagesOpen && <PagesStrip');
  });
});

describe("the collapse still remembers, which is why this mattered", () => {
  it("shut stays shut across visits", () => {
    expect(strip).toContain('const OPEN_KEY = "hypefy_updates_open";');
    expect(strip).toContain('localStorage.getItem(OPEN_KEY) !== "0"');
  });

  it("and a device that cannot store it opens, rather than hides", () => {
    // Private mode, blocked storage: the safe answer is showing the strip.
    const fn = strip.slice(strip.indexOf("export function readPagesOpen"));
    expect(fn.slice(0, 300)).toContain('if (typeof window === "undefined") return true;');
  });
});
