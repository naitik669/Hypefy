/**
 * The Ambient sticker colour: a deep shade of the photo's own colour.
 *
 * Sampled once in the editor and stored on the layer as `tint`, so the
 * viewer draws exactly what the author saw without reading the picture
 * again. Deep on purpose: white words sit on it, and it has to pass 4.5:1
 * whatever the photo was.
 */

export type Rgb = { r: number; g: number; b: number };

function luminance({ r, g, b }: Rgb): number {
  const c = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
}

/** How white text reads on this colour. */
export function contrastWithWhite(rgb: Rgb): number {
  return 1.05 / (luminance(rgb) + 0.05);
}

function toHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === rr ? ((gg - bb) / d + (gg < bb ? 6 : 0)) / 6 : max === gg ? ((bb - rr) / d + 2) / 6 : ((rr - gg) / d + 4) / 6;
  return { h, s, l };
}

function fromHsl({ h, s, l }: { h: number; s: number; l: number }): Rgb {
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const ch = (t: number) => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  return { r: Math.round(ch(h + 1 / 3) * 255), g: Math.round(ch(h) * 255), b: Math.round(ch(h - 1 / 3) * 255) };
}

const hex = (rgb: Rgb) =>
  `#${[rgb.r, rgb.g, rgb.b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("")}`;

/**
 * The photo's colour, deepened until white words pass on it.
 *
 * Saturation is held in a band — a grey photo still gets a hint of its
 * hue, and a neon one does not turn into a highlighter.
 */
export function ambientTint(average: Rgb): string {
  const hsl = toHsl(average);
  const s = Math.min(0.72, Math.max(hsl.s, hsl.s < 0.05 ? 0 : 0.35));
  let l = 0.3;
  let rgb = fromHsl({ h: hsl.h, s, l });
  while (contrastWithWhite(rgb) < 4.5 && l > 0.05) {
    l -= 0.02;
    rgb = fromHsl({ h: hsl.h, s, l });
  }
  return hex(rgb);
}

/** The average colour of a picture, read from a small copy of it. */
export async function photoAverage(url: string): Promise<Rgb | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    await img.decode();
    const side = 24;
    const canvas = document.createElement("canvas");
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, side, side);
    const data = ctx.getImageData(0, 0, side, side).data;
    let r = 0;
    let g = 0;
    let b = 0;
    const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
  } catch {
    return null;
  }
}
