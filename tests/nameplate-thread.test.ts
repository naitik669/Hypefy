import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Who is talking, wearing what they bought.
 *
 * In a group of eight, a colour is read before a word is — and Hypefy
 * already sells the colours. The name above a message carries the
 * sender's nameplate.
 *
 * The risk was never the idea, it was 11px of text over somebody's
 * artwork. So the floor is computed here rather than eyeballed: every
 * plate in the catalogue, composited the way the thread composites it,
 * against the lightest chat theme the app ships.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const plateSrc = read("src/components/ui/Nameplate.tsx");
const themeSrc = read("src/lib/chat-themes.ts");
const chat = read("src/components/messages/RealChatView.tsx");

/* ── colour maths, the WCAG way ──────────────────────────────────────── */

type Rgb = readonly [number, number, number];

const channel = (c: number) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: Rgb) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** `over` laid on `under` at `alpha`. */
const composite = (over: Rgb, under: Rgb, alpha: number): Rgb =>
  [0, 1, 2].map((i) => over[i] * alpha + under[i] * (1 - alpha)) as unknown as Rgb;

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

/* ── what the app actually ships ─────────────────────────────────────── */

/** Every plate's wash colour and its strength, read from the catalogue. */
function plates(): { rgb: Rgb; strength: number }[] {
  const out: { rgb: Rgb; strength: number }[] = [];
  const re = /wash\("(\d+),\s*(\d+),\s*(\d+)",\s*([\d.]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(plateSrc)) !== null) {
    out.push({
      rgb: [Number(m[1]), Number(m[2]), Number(m[3])],
      strength: Number(m[4]),
    });
  }
  return out;
}

/** The damping every wash is multiplied by before it is drawn. */
function damp(): number {
  const m = plateSrc.match(/const DAMP = ([\d.]+);/);
  if (!m) throw new Error("DAMP not found — the wash maths moved");
  return Number(m[1]);
}

/** The lightest solid background any chat theme sets. */
function lightestTheme(): Rgb {
  const hexes = [...themeSrc.matchAll(/background: "#([0-9a-fA-F]{6})"/g)].map(
    (m) =>
      [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) as unknown as Rgb,
  );
  if (hexes.length === 0) throw new Error("no solid theme backgrounds found");
  return hexes.reduce((a, b) => (luminance(b) > luminance(a) ? b : a));
}

/** The scrim the name chip lays down before the plate goes on. */
function scrimAlpha(): number {
  const m = chat.match(/bg-black\/(\d+) text-foreground/);
  if (!m) throw new Error("the name chip's scrim moved");
  return Number(m[1]) / 100;
}

describe("the floor under the name", () => {
  it("every plate the app sells clears 4.5:1 for white", () => {
    // Worst case all the way down: the lightest theme, each plate at the
    // strongest point of its gradient. If somebody adds a lighter theme
    // or a bolder plate, this fails rather than shipping a smudge.
    const base = composite(BLACK, lightestTheme(), scrimAlpha());
    const d = damp();
    const all = plates();
    expect(all.length, "no plates parsed — the catalogue moved").toBeGreaterThan(5);

    for (const { rgb, strength } of all) {
      const surface = composite(rgb, base, strength * d);
      const ratio = contrast(WHITE, surface);
      expect(ratio, `rgb(${rgb.join(",")}) at ${strength} → ${ratio.toFixed(2)}:1`)
        .toBeGreaterThanOrEqual(4.5);
    }
  });

  it("and the scrim is what earns it, not the theme being dark", () => {
    // Without it the chip is whatever is behind the chat, and three of
    // the shipped themes are light. Checked by removing it: the same sum
    // against the lightest theme drops below the line.
    const d = damp();
    const worst = plates().reduce((acc, { rgb, strength }) => {
      const bare = composite(rgb, lightestTheme(), strength * d);
      return Math.min(acc, contrast(WHITE, bare));
    }, Infinity);
    expect(worst).toBeLessThan(4.5);
  });
});

describe("where the plate goes", () => {
  it("behind the name, and nothing else", () => {
    // A wash behind the words themselves is how a thread stops being
    // readable, and the words are the point.
    const at = chat.indexOf("<Nameplate id={members?.[m.sender_id]?.nameplate}");
    expect(at).toBeGreaterThan(-1);
    const block = chat.slice(at, at + 220);
    expect(block).toContain("{senderName(m.sender_id)}");
    expect(block).not.toContain("Bubble");
  });

  it("only in a group, where there is somebody to tell apart", () => {
    expect(chat).toContain("const showSender = isGroup && !mine");
  });

  it("someone wearing nothing keeps the quiet grey name", () => {
    // The plate is what makes white worth the scrim. Without one there
    // is no scrim, so white would be a change for no reason.
    expect(chat).toContain('members?.[m.sender_id]?.nameplate\n                              ? "bg-black/75 text-foreground"\n                              : "text-muted"');
  });

  it("and the thread is actually told what everyone wears", () => {
    // The plate id has to survive the whole way from the member query.
    const page = read("src/app/(app)/messages/[threadId]/page.tsx");
    expect(page).toContain("bubble_style, nameplate)");
    expect(page).toContain("nameplate: p.nameplate ?? null,");
  });
});
