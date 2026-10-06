// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";

/**
 * Loading shapes for the pages that only had three dots: a chat opening, and
 * the lists of people. A skeleton that is the wrong shape is worse than none,
 * so these hold each one to the page it stands in for.
 */

const html = async (path: string) => {
  const mod = (await import(path)) as { default: () => React.ReactElement };
  return renderToStaticMarkup(createElement(mod.default));
};

describe("loading shapes", () => {
  it("draws a chat as a chat: its header, bubbles on both sides, the composer", async () => {
    const out = await html("@/app/(app)/messages/[threadId]/loading");
    expect(out).toContain('aria-busy="true"');
    expect(out.match(/justify-end"/g)?.length).toBeGreaterThan(1);
    expect(out.match(/justify-start"/g)?.length).toBeGreaterThan(1);
  });

  it("uses the chat's own frame and header, so nothing moves when the chat lands", () => {
    const chat = readFileSync("src/components/messages/RealChatView.tsx", "utf8");
    const skeleton = readFileSync("src/components/skeletons/Skeletons.tsx", "utf8");
    for (const cls of [
      "fixed inset-0 z-50 mx-auto flex max-w-[480px] flex-col bg-background",
      "flex h-[calc(3.5rem+var(--sat))] items-center gap-2 border-b border-border/60 chrome-bar px-2 pt-[var(--sat)]",
    ]) {
      expect(chat, cls).toContain(cls);
      expect(skeleton, cls).toContain(cls);
    }
  });

  it("does not stand a chat in for the chat's info or media pages", async () => {
    for (const page of ["info", "media"]) {
      const out = await html(`@/app/(app)/messages/[threadId]/${page}/loading`);
      expect(out, page).not.toContain("justify-end");
      expect(out, page).toContain('aria-label="Loading"');
    }
  });

  it("names the page it is loading, where the page is known", async () => {
    expect(await html("@/app/(app)/hypers/loading")).toContain(">Hypers</h1>");
    expect(await html("@/app/(app)/requests/loading")).toContain(">Follow requests</h1>");
    expect(await html("@/app/(app)/shows/loading")).toContain(">Your Shows</h1>");
    // The titles are the pages' own.
    expect(readFileSync("src/app/(app)/hypers/page.tsx", "utf8")).toContain('title="Hypers"');
    expect(readFileSync("src/app/(app)/requests/page.tsx", "utf8")).toContain('title="Follow requests"');
    expect(readFileSync("src/app/(app)/shows/page.tsx", "utf8")).toContain('title="Your Shows"');
  });

  it("does not guess between Followers and Following", async () => {
    const out = await html("@/app/(app)/u/[username]/[list]/loading");
    expect(out).not.toMatch(/Followers|Following/);
    expect(out).toContain("skeleton");
  });
});
