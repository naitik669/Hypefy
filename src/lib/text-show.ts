/**
 * A text Show: words on a colour, drawn to a still the size of any other
 * Show (1080×1920) so the arrange step, the publish path and the viewer all
 * take it the way they take a photo. Nothing downstream has to know it was
 * typed rather than taken.
 */

export const TEXT_SHOW_W = 1080;
export const TEXT_SHOW_H = 1920;
/** Long enough for a thought, short enough to stay big on the screen. */
export const TEXT_SHOW_MAX = 200;

export type TextShowStyle = "bold" | "classic" | "marker" | "mono";

/**
 * The type styles. Each names the CSS variable next/font put its family in
 * (layout.tsx), so the picture uses the font the screen showed rather than a
 * hard-coded name that next/font would have hashed away.
 */
export const TEXT_SHOW_STYLES: {
  id: TextShowStyle;
  label: string;
  /** The --font-* variable holding the family, or null for the system mono stack. */
  fontVar: string | null;
  weight: number;
  italic: boolean;
}[] = [
  { id: "bold", label: "Bold", fontVar: "--font-jakarta", weight: 800, italic: false },
  { id: "classic", label: "Classic", fontVar: "--font-name-classic", weight: 800, italic: true },
  { id: "marker", label: "Marker", fontVar: "--font-name-marker", weight: 400, italic: false },
  { id: "mono", label: "Mono", fontVar: null, weight: 700, italic: false },
];

export const MONO_STACK = "ui-monospace, SFMono-Regular, Menlo, monospace";

/** Backgrounds, each with the ink that reads on it (all at least 4.5:1). */
export const TEXT_SHOW_BACKGROUNDS: { id: string; label: string; bg: string; ink: string }[] = [
  { id: "lime", label: "Lime", bg: "#a3e635", ink: "#0a0a0a" },
  { id: "violet", label: "Violet", bg: "#6d28d9", ink: "#ffffff" },
  { id: "coral", label: "Coral", bg: "#f97362", ink: "#0a0a0a" },
  { id: "night", label: "Night", bg: "#141414", ink: "#ffffff" },
  { id: "sky", label: "Sky", bg: "#38bdf8", ink: "#0a0a0a" },
];

/**
 * Lines that fit `maxWidth`, breaking on spaces, keeping the writer's own
 * line breaks, and cutting a word that is wider than a line on its own
 * rather than letting it run off the edge.
 */
export function wrapLines(text: string, measure: (s: string) => number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (measure(next) <= maxWidth) {
        line = next;
        continue;
      }
      if (line) out.push(line);
      // A word wider than the line: cut it into pieces that fit.
      if (measure(word) > maxWidth) {
        let piece = "";
        for (const ch of word) {
          if (piece && measure(piece + ch) > maxWidth) {
            out.push(piece);
            piece = ch;
          } else piece += ch;
        }
        line = piece;
      } else line = word;
    }
    out.push(line);
  }
  return out;
}

/**
 * The biggest size, from `max` down to `min` in steps of 4, at which the
 * text wraps into a block that fits the box. Below `min` it stays at `min`.
 */
export function fitText(
  text: string,
  measureAt: (s: string, size: number) => number,
  box: { width: number; height: number },
  { max = 132, min = 52, lineHeight = 1.15 } = {},
): { size: number; lines: string[] } {
  for (let size = max; size >= min; size -= 4) {
    const lines = wrapLines(text, (s) => measureAt(s, size), box.width);
    if (lines.length * size * lineHeight <= box.height) return { size, lines };
  }
  return { size: min, lines: wrapLines(text, (s) => measureAt(s, min), box.width) };
}

/** The font family a style draws with, read from the page's own variables. */
export function familyFor(style: TextShowStyle, readVar: (name: string) => string): string {
  const s = TEXT_SHOW_STYLES.find((x) => x.id === style)!;
  if (!s.fontVar) return MONO_STACK;
  const family = readVar(s.fontVar).trim();
  return family || "system-ui, sans-serif";
}

/** The words, drawn centred on their colour, as a JPEG the size of a Show. */
export async function renderTextShow({
  text,
  style,
  background,
}: {
  text: string;
  style: TextShowStyle;
  background: { bg: string; ink: string };
}): Promise<File> {
  const s = TEXT_SHOW_STYLES.find((x) => x.id === style)!;
  const family = familyFor(style, (n) => getComputedStyle(document.documentElement).getPropertyValue(n));
  const font = (size: number) => `${s.italic ? "italic " : ""}${s.weight} ${size}px ${family}`;

  // Marker and Classic are not preloaded; draw only once the face is in,
  // or the picture comes out in the fallback.
  try {
    await document.fonts.load(font(100), text);
  } catch {
    /* the fallback is still legible */
  }

  const canvas = document.createElement("canvas");
  canvas.width = TEXT_SHOW_W;
  canvas.height = TEXT_SHOW_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");

  ctx.fillStyle = background.bg;
  ctx.fillRect(0, 0, TEXT_SHOW_W, TEXT_SHOW_H);

  const pad = 110;
  const lineHeight = 1.15;
  const { size, lines } = fitText(
    text.trim(),
    (str, px) => {
      ctx.font = font(px);
      return ctx.measureText(str).width;
    },
    // The top and bottom fifth are where the viewer draws its own chrome.
    { width: TEXT_SHOW_W - pad * 2, height: TEXT_SHOW_H * 0.6 },
    { lineHeight },
  );

  ctx.font = font(size);
  ctx.fillStyle = background.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const step = size * lineHeight;
  const top = TEXT_SHOW_H / 2 - ((lines.length - 1) * step) / 2;
  lines.forEach((line, i) => ctx.fillText(line, TEXT_SHOW_W / 2, top + i * step));

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("could not save picture"))), "image/jpeg", 0.92),
  );
  return new File([blob], `show-text-${Date.now()}.jpg`, { type: "image/jpeg" });
}
