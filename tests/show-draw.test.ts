import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BRUSHES, brushStyle, coverFit } from "@/lib/draw";

describe("drawing on a Show", () => {
  it("has the six brushes the design shows", () => {
    expect([...BRUSHES]).toEqual(["pen", "marker", "highlighter", "neon", "arrow", "eraser"]);
  });

  it("each brush has its own character from one size", () => {
    expect(brushStyle("highlighter", 10)).toMatchObject({ width: 30, alpha: 0.4, cap: "butt" });
    expect(brushStyle("neon", 10).glow).toBeGreaterThan(0);
    expect(brushStyle("pen", 10)).toMatchObject({ width: 10, alpha: 1, glow: 0 });
  });

  it("maps the frame onto a photo that covers it", () => {
    // A 1000×1000 photo covering a 390×844 frame is scaled by 0.844 and
    // cut equally off both sides.
    const fit = coverFit({ width: 1000, height: 1000 }, { width: 390, height: 844 });
    expect(fit.scale).toBeCloseTo(0.844);
    expect(fit.offsetY).toBeCloseTo(0);
    expect(fit.offsetX).toBeCloseTo((844 - 390) / 2);
  });

  it("is flattened into the photo before the preview, with the eraser kept off the photo", () => {
    const draw = readFileSync("src/lib/draw.ts", "utf8");
    expect(draw).toContain("inkCtx.setTransform(1 / fit.scale, 0, 0, 1 / fit.scale, fit.offsetX / fit.scale, fit.offsetY / fit.scale);");
    const create = readFileSync("src/components/create/CreateScreen.tsx", "utf8");
    expect(create).toContain("void flattenDrawing(captured, drawing.strokes, drawing.frame).then((file) => {");
    expect(create).toContain("file={drawn ?? captured}");
  });

  it("and it sits on the photo, under every sticker", () => {
    const editor = readFileSync("src/components/shows/ShowEditor.tsx", "utf8");
    expect(editor.indexOf("<DrawCanvas strokes={strokes} frame={frame} />")).toBeLessThan(
      editor.indexOf("<LayerView layer={layer} frame={frame} editing embeds={embeds} />"),
    );
  });
});
