/**
 * A page, saved as a picture.
 *
 * An archived page is yours alone and nobody can open it any more, so the only
 * way to keep one is to take it out of the app. That means drawing it rather
 * than screenshotting it: the same inks (pageStops), the same words, the photo
 * if it had one, and the wordmark at its foot so the picture says where it
 * came from once it is in a camera roll among everything else.
 *
 * Drawn on a canvas rather than rendered from the DOM, which needs a library,
 * downloads the fonts again, and tends to give up inside a WebView.
 */

/** The picture's width. Tall enough to stay sharp when it is sent on. */
const W = 1080;
const PAD = 84;
const RADIUS = 56;
/** The widest the words run before they wrap. */
const INNER = W - PAD * 2;

export type PageImage = {
  text: string;
  /** The page's two inks and its corner light — see pageStops. */
  stops: { from: string; to: string; glow: string };
  /** A photo page's photo, already loaded. */
  photo: HTMLImageElement | null;
  /** "Title — Artist", if it had a song. */
  track: string | null;
  /** The colour of the full stop in the wordmark. */
  accent: string;
};

/**
 * Break text into lines that fit, measuring with the caller's measurer so this
 * can be reasoned about — and tested — without a canvas. A word longer than
 * the line gets its own line rather than being cut. Exported for tests.
 */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && measure(next) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  // A page with nothing written on it is a photo page: no empty line for it.
  return lines.filter((l, i) => l !== "" || lines.length === 1 || i < lines.length - 1);
}

/**
 * The biggest size the words can take and still fit the space they have: at
 * most `maxLines` lines, none wider than `maxWidth`. Walks down from the
 * largest, so a short page stays large and a long one settles. Exported for
 * tests.
 */
export function fitText(
  text: string,
  maxWidth: number,
  maxLines: number,
  measureAt: (size: number, s: string) => number,
  sizes: number[] = [128, 112, 96, 84, 72, 64, 56, 48, 42, 38, 34, 30],
): { size: number; lines: string[] } {
  for (const size of sizes) {
    const lines = wrapText(text, maxWidth, (s) => measureAt(size, s));
    if (lines.length <= maxLines && lines.every((l) => measureAt(size, l) <= maxWidth)) {
      return { size, lines };
    }
  }
  const size = sizes[sizes.length - 1];
  return { size, lines: wrapText(text, maxWidth, (s) => measureAt(size, s)) };
}

/**
 * The face the app is set in, read off the document.
 *
 * A canvas cannot read CSS variables: --font-jakarta in a font string is not
 * a font, it is a syntax error, and a canvas handed one quietly goes on
 * drawing at its default 10px. So the family is taken from the body, where
 * the variable has already been resolved.
 */
function faceOf(): string {
  const family = typeof document !== "undefined" ? getComputedStyle(document.body).fontFamily : "";
  return family || '"Plus Jakarta Sans", system-ui, sans-serif';
}

function roundedPath(ctx: CanvasRenderingContext2D, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(w, 0, w, h, r);
  ctx.arcTo(w, h, 0, h, r);
  ctx.arcTo(0, h, 0, 0, r);
  ctx.arcTo(0, 0, w, 0, r);
  ctx.closePath();
}

/** Load a photo for drawing. Null if it cannot be read — a page still saves without it. */
export function loadPhoto(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    // Without this the canvas is tainted and nothing can be saved from it.
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Draw the page and hand back the picture. */
export async function renderPageImage(page: PageImage): Promise<Blob | null> {
  // The words are measured in the face they will be drawn in, so a page is
  // never sized for a font it was not set in.
  await document.fonts?.ready;
  const face = faceOf();
  const FONT = (weight: number, size: number) => `${weight} ${size}px ${face}`;

  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) return null;
  const measureAt = (size: number, s: string) => {
    probe.font = FONT(800, size);
    return probe.measureText(s).width;
  };

  // The photo first: it decides how much room the words have.
  const photoW = INNER;
  const photoH = page.photo ? Math.min(Math.round((page.photo.height / page.photo.width) * photoW), 1120) : 0;
  const hasText = !!page.text.trim();
  const { size, lines } = hasText
    ? fitText(page.text.trim(), INNER, page.photo ? 3 : 6, measureAt)
    : { size: 0, lines: [] as string[] };

  const lineH = Math.round(size * 1.12);
  const textH = lines.length * lineH;
  const trackH = page.track ? 52 : 0;
  const footerH = 96;
  const body = photoH + (photoH && hasText ? 44 : 0) + textH + (trackH ? 20 + trackH : 0);
  // A written page keeps a portrait frame; a photo page grows to its photo.
  const H = page.photo ? PAD + body + 40 + footerH + PAD : Math.max(1350, PAD * 2 + body + footerH);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // The page itself: its two inks, and the light over the top corner.
  const ink = ctx.createLinearGradient(W * 0.25, 0, W * 0.75, H);
  ink.addColorStop(0, page.stops.from);
  ink.addColorStop(1, page.stops.to);
  roundedPath(ctx, W, H, RADIUS);
  ctx.fillStyle = ink;
  ctx.fill();
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, W * 1.2);
  glow.addColorStop(0, page.stops.glow);
  glow.addColorStop(0.6, "transparent");
  ctx.fillStyle = glow;
  ctx.fill();

  ctx.save();
  roundedPath(ctx, W, H, RADIUS);
  ctx.clip();

  let y = page.photo ? PAD : Math.round((H - body - footerH) / 2);

  if (page.photo && photoH) {
    ctx.save();
    roundedPath(ctx, photoW, photoH, 36);
    ctx.translate(PAD, y);
    roundedPath(ctx, photoW, photoH, 36);
    ctx.clip();
    ctx.drawImage(page.photo, 0, 0, photoW, photoH);
    ctx.restore();
    y += photoH + (hasText ? 44 : 0);
  }

  if (hasText) {
    ctx.fillStyle = "#fff";
    ctx.font = FONT(800, size);
    ctx.textBaseline = "top";
    for (const line of lines) {
      ctx.fillText(line, PAD, y);
      y += lineH;
    }
  }

  if (page.track) {
    y += 20;
    ctx.fillStyle = "rgba(255,255,255,0.68)";
    ctx.font = FONT(600, 34);
    ctx.textBaseline = "top";
    ctx.fillText(page.track, PAD, y);
  }

  // The wordmark, at the foot: white word, lime stop, as everywhere else.
  const footY = H - PAD + 6;
  ctx.textBaseline = "alphabetic";
  ctx.font = FONT(800, 40);
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.fillText("hypefy", PAD, footY);
  ctx.fillStyle = page.accent;
  ctx.fillText(".", PAD + ctx.measureText("hypefy").width, footY);

  ctx.restore();

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

/**
 * Put the picture somewhere the person keeps things.
 *
 * The share sheet where there is one — on a phone that is how a picture
 * reaches the camera roll, and it lets them send it on instead if that is
 * what they meant. A plain download otherwise, which is what a desktop
 * browser does with it.
 */
export async function savePageImage(blob: Blob, filename: string): Promise<"shared" | "downloaded" | "failed"> {
  const file = new File([blob], filename, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (e) {
      // Dismissing the sheet is not a failure, and must not look like one.
      if ((e as Error)?.name === "AbortError") return "shared";
    }
  }
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return "downloaded";
  } catch {
    return "failed";
  }
}
