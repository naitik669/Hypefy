// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * The two pages nobody means to see. They are mostly picture, but three
 * things about them matter: a 404 offers the way back, a crash offers the
 * reload first, and a crash shows the id that finds it in the logs — only
 * when there is one, since an empty line of grey text is just litter.
 */

describe("the 404", () => {
  it("says what happened and offers the way home", async () => {
    const { default: NotFound } = await import("@/app/not-found");
    const html = renderToStaticMarkup(createElement(NotFound));
    expect(html).toContain("beamed up");
    expect(html).toContain('href="/home"');
  });
});

describe("the crash page", () => {
  async function render(error: Error & { digest?: string }) {
    const { default: GlobalError } = await import("@/app/global-error");
    return renderToStaticMarkup(createElement(GlobalError, { error }));
  }

  it("stands on its own: its own document, its own styles, no class from the app", async () => {
    // It renders when the app shell and its stylesheet have failed.
    const html = await render(new Error("boom"));
    expect(html).toContain("<html");
    expect(html).toContain("@keyframes crash-tumble");
    expect(html).not.toMatch(/class="[^"]*\b(bg-background|text-muted|rounded-2xl)\b/);
  });

  it("offers the reload first, and home after it", async () => {
    const html = await render(new Error("boom"));
    expect(html.indexOf("Try again")).toBeGreaterThan(-1);
    expect(html.indexOf("Try again")).toBeLessThan(html.indexOf(">Home<"));
  });

  it("shows the id that finds this crash in the logs", async () => {
    const html = await render(Object.assign(new Error("boom"), { digest: "3f81c0ad99" }));
    expect(html).toContain("3f81c0ad99");
  });

  it("says nothing where there is no id, rather than an empty line", async () => {
    const html = await render(new Error("boom"));
    expect(html).not.toContain("tabular-nums");
  });

  it("does not put the error's own words on the screen", async () => {
    // They are for us, not for whoever hit it: they leak internals and read
    // as gibberish to everyone else.
    const html = await render(new Error("ECONNREFUSED 10.0.0.4:5432"));
    expect(html).not.toContain("ECONNREFUSED");
  });
});
