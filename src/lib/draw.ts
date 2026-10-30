/**
 * Drawing on a Show: strokes kept as points while you draw, so a stroke
 * can be taken back, and painted into the photo itself when it is posted.
 *
 * A drawing is not a layer. It cannot be moved or recoloured afterwards
 * and nobody needs it to be, so it is flattened rather than given a
 * column of its own.
 */

export const BRUSHES = ["pen", "marker", "highlighter", "neon", "arrow", "eraser"] as const;
export type Brush = (typeof BRUSHES)[number];

export type Stroke = { brush: Brush; color: string; size: number; points: { x: number; y: number }[] };

export const INKS = ["#ffffff", "#0a0a0a", "#a3e635", "#fde047", "#f472b6", "#38bdf8", "#ef4444", "#a855f7"];

export const SIZE_MIN = 2;
export const SIZE_MAX = 40;

/** Each brush's own character, from the one size the slider sets. */
export function brushStyle(brush: Brush, size: number) {
  switch (brush) {
    case "marker":
      return { width: size * 1.8, alpha: 0.92, cap: "square" as CanvasLineCap, glow: 0 };
    case "highlighter":
      return { width: size * 3, alpha: 0.4, cap: "butt" as CanvasLineCap, glow: 0 };
    case "neon":
      return { width: size, alpha: 1, cap: "round" as CanvasLineCap, glow: size * 2.2 };
    case "eraser":
      return { width: size * 2.5, alpha: 1, cap: "round" as CanvasLineCap, glow: 0 };
    default:
      return { width: size, alpha: 1, cap: "round" as CanvasLineCap, glow: 0 };
  }
}

/** A smooth line through the points: midpoints joined by curves, so a fast stroke is not a polygon. */
function trace(ctx: CanvasRenderingContext2D, points: Stroke["points"]) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  if (points.length === 1) {
    ctx.lineTo(points[0].x + 0.01, points[0].y);
    return;
  }
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2;
    const my = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, mx, my);
  }
  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
}

/** One stroke onto a context already scaled to the frame. */
export function paintStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  if (s.points.length === 0) return;
  const st = brushStyle(s.brush, s.size);
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = st.cap;
  ctx.lineWidth = st.width;
  ctx.globalAlpha = st.alpha;
  ctx.strokeStyle = s.color;
  ctx.globalCompositeOperation = s.brush === "eraser" ? "destination-out" : "source-over";

  if (s.brush === "arrow") {
    const a = s.points[0];
    const b = s.points[s.points.length - 1];
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const head = Math.max(14, s.size * 3.2);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.moveTo(b.x - head * Math.cos(angle - 0.5), b.y - head * Math.sin(angle - 0.5));
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(b.x - head * Math.cos(angle + 0.5), b.y - head * Math.sin(angle + 0.5));
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (s.brush === "neon") {
    // The glow in the ink's colour, then a white core down the middle.
    ctx.shadowColor = s.color;
    ctx.shadowBlur = st.glow;
    trace(ctx, s.points);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = Math.max(1.5, st.width * 0.38);
    trace(ctx, s.points);
    ctx.stroke();
    ctx.restore();
    return;
  }

  trace(ctx, s.points);
  ctx.stroke();
  ctx.restore();
}

/** Every stroke, in order, onto a canvas of the frame's size. */
export function paintAll(ctx: CanvasRenderingContext2D, strokes: Stroke[], width: number, height: number) {
  ctx.clearRect(0, 0, width, height);
  for (const s of strokes) paintStroke(ctx, s);
}

/**
 * Where the frame sits over the photo, which fills it by covering: the
 * scale from photo pixels to frame pixels, and how much of the photo is
 * cut off on each axis.
 */
export function coverFit(photo: { width: number; height: number }, frame: { width: number; height: number }) {
  const scale = Math.max(frame.width / photo.width, frame.height / photo.height);
  return {
    scale,
    offsetX: (photo.width * scale - frame.width) / 2,
    offsetY: (photo.height * scale - frame.height) / 2,
  };
}

/**
 * The photo with the drawing painted into it, at the photo's own size.
 *
 * The frame shows the photo covering it, so a point on the frame is a
 * point on the photo shifted by what was cut off and divided by the
 * scale; the strokes are painted through exactly that transform.
 */
export async function flattenDrawing(
  photo: File,
  strokes: Stroke[],
  frame: { width: number; height: number },
): Promise<File> {
  if (strokes.length === 0) return photo;
  const bitmap = await createImageBitmap(photo);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return photo;
  ctx.drawImage(bitmap, 0, 0);

  // Drawn on a layer of its own first, so the eraser takes out ink and
  // not the photo under it.
  const ink = document.createElement("canvas");
  ink.width = bitmap.width;
  ink.height = bitmap.height;
  const inkCtx = ink.getContext("2d");
  if (!inkCtx) return photo;
  const fit = coverFit(bitmap, frame);
  inkCtx.setTransform(1 / fit.scale, 0, 0, 1 / fit.scale, fit.offsetX / fit.scale, fit.offsetY / fit.scale);
  for (const s of strokes) paintStroke(inkCtx, s);
  ctx.drawImage(ink, 0, 0);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) return photo;
  const name = photo.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg" });
}
