import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The four accessibility defects that lock someone out, rather than the
 * whole WCAG list.
 *
 * Three of them are the same shape: a thing you can only do with a finger.
 * A 420ms hold on a div with no role, a vertical swipe, a pointerdown
 * handler on a button — each is invisible to a keyboard, a switch device
 * and a screen reader, and behind them sat Reply, Forward, Pin, Report,
 * the whole Shots feed past the first one, and taking a photo. The fourth
 * is contrast, which is arithmetic.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

/** WCAG relative luminance and contrast, so the token is measured not guessed. */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const css = read("src/app/globals.css");
const token = (name: string) => {
  const m = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!m) throw new Error(`--color-${name} not found`);
  return m[1].toLowerCase();
};

describe("tertiary text is readable", () => {
  it("faint clears AA for normal text on the app background and on cards", () => {
    // It was #555555 — 2.66:1 — used as text in a few hundred places.
    const faint = token("faint");
    expect(contrast(faint, token("background"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(faint, token("surface"))).toBeGreaterThanOrEqual(4.5);
  });

  it("and clears the 3:1 bar for UI and large text even on sheets", () => {
    // --color-elevated cannot reach 4.5 without faint and muted becoming
    // the same colour; the comment on the token records that choice.
    expect(contrast(token("faint"), token("elevated"))).toBeGreaterThanOrEqual(3);
  });

  it("muted is still visibly lighter than faint, or the scale is pointless", () => {
    const gap = luminance(token("muted")) - luminance(token("faint"));
    expect(gap).toBeGreaterThan(0.01);
  });

  it("secondary text was already fine and stays fine", () => {
    expect(contrast(token("muted"), token("background"))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("the page can be zoomed", () => {
  it("nothing caps the scale", () => {
    // WCAG 1.4.4. The smallest type in the app is 10px.
    // The property, not the word — the comment above it explains why the
    // cap is gone and names it.
    const layout = read("src/app/layout.tsx");
    expect(layout).not.toMatch(/^\s*maximumScale:/m);
    expect(layout).not.toMatch(/^\s*userScalable:/m);
  });
});

describe("the shutter works without a finger", () => {
  const cam = read("src/components/messages/CameraCapture.tsx");

  it("a keyboard or switch activation takes a photo", () => {
    expect(cam).toContain("onClick={onShutterClick}");
    expect(cam).toContain("function onShutterClick");
  });

  it("and a real tap still takes exactly one", () => {
    // A tap fires pointerup AND click; only a keyboard click has detail 0.
    expect(cam).toContain("if (e.detail !== 0 || !ready || recorderRef.current) return;");
  });
});

describe("a message's actions are reachable", () => {
  const chat = read("src/components/messages/RealChatView.tsx");

  it("there is a focusable control per message, not only a hold", () => {
    // Reply, Forward, Pin and Report all sat behind a 420ms hold on a div
    // with no role and no tabindex.
    expect(chat).toContain("Message options");
    expect(chat).toContain("sr-only focus:not-sr-only");
  });

  it("it opens the same menu the hold does", () => {
    expect(chat).toContain("function openMenu(m: ChatMsg, el: HTMLElement)");
    const row = chat.slice(chat.indexOf("Message options") - 700, chat.indexOf("Message options"));
    expect(row).toContain("openMenu(m, row)");
  });

  it("and the menu's own items are buttons, so tab reaches them", () => {
    expect(chat).toContain('function CtxItem(');
    const item = chat.slice(chat.indexOf("function CtxItem("));
    expect(item.slice(0, 300)).toContain('<button type="button"');
  });

  it("an unsent message offers nothing, as the hold does not", () => {
    expect(chat).toContain("{!m.is_unsent && (");
  });
});

describe("the Shots reel can be paged without a swipe", () => {
  const reels = read("src/components/shots/ReelsFeed.tsx");

  it("arrow keys move the reel", () => {
    expect(reels).toContain("function onStageKeyDown");
    expect(reels).toContain('e.key === "ArrowDown" || e.key === "PageDown"');
    expect(reels).toContain('e.key === "ArrowUp" || e.key === "PageUp"');
  });

  it("and there are real buttons, so switch access and tab reach it too", () => {
    expect(reels).toContain("Previous Shot");
    expect(reels).toContain("Next Shot");
    expect(reels).toContain("sr-only focus:not-sr-only");
  });

  it("the first reel has no previous", () => {
    expect(reels).toContain("disabled={activeIdx === 0}");
    const step = reels.slice(reels.indexOf("function step(delta: 1 | -1)"));
    expect(step.slice(0, 600)).toContain("if (activeIdx > 0) setActiveIdx((i) => i - 1);");
  });

  it("the stage announces itself", () => {
    expect(reels).toContain('aria-roledescription="carousel"');
    expect(reels).toContain('aria-label="Shots"');
  });
});

describe("the other swipeable surfaces already had a way in", () => {
  it("the diary deck takes focus and listens for arrows", () => {
    const stack = read("src/components/diary/DiaryStack.tsx");
    expect(stack).toContain('aria-keyshortcuts="ArrowLeft ArrowRight"');
    expect(stack).toContain('aria-roledescription="card stack"');
  });

  it("the floating page is a link with arrow keys on it", () => {
    const floating = read("src/components/diary/FloatingPages.tsx");
    expect(floating).toContain('if (e.key === "ArrowRight") flick(1);');
  });

  it("the Show arrows are buttons, and now they say what they do", () => {
    const viewer = read("src/components/shows/ShowViewer.tsx");
    expect(viewer).toContain('aria-label="Previous Show"');
    expect(viewer).toContain('aria-label="Next Show"');
  });
});
