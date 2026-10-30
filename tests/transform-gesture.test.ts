import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import {
  SNAP_DEGREES,
  dragged,
  pinched,
  pulled,
  snapAngle,
  swung,
  topmostAt,
  wrapDegrees,
  type Placed,
} from "@/lib/transform-gesture";
import { LAYER_POS_MAX, LAYER_POS_MIN, LAYER_SCALE_MAX, LAYER_SCALE_MIN } from "@/lib/show-layers";

/**
 * Moving, sizing and turning a layer.
 *
 * Driven for real in a browser as well as asserted here: dragging moved
 * a sticker by exactly the distance asked, the rotate handle swung it to
 * 90°, the corner pulled it to 2.01× and a pinch from 80px apart to 60px
 * took it to 1.51×.
 *
 * That run found the bug the unit tests could not: setPointerCapture
 * threw on the handles *before* the window listeners were attached, so
 * dragging worked and both handles silently did nothing.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const editor = read("src/components/shows/ShowEditor.tsx");

const FRAME = { width: 390, height: 844 };
const at = (x: number, y: number) => ({ x, y });
const start: Placed = { x: 0.5, y: 0.5, scale: 1, rotation: 0 };

describe("dragging", () => {
  it("moves by the distance travelled, as a fraction of the frame", () => {
    // Dragging a third of the way across should be a third at any size.
    const moved = dragged(start, at(0, 0), at(130, 211), FRAME);
    expect(moved.x).toBeCloseTo(0.5 + 130 / 390, 6);
    expect(moved.y).toBeCloseTo(0.5 + 211 / 844, 6);
  });

  it("the same drag on a bigger frame moves the layer the same share", () => {
    const small = dragged(start, at(0, 0), at(39, 0), FRAME);
    const big = dragged(start, at(0, 0), at(108, 0), { width: 1080, height: 2337 });
    expect(small.x).toBeCloseTo(big.x, 6);
  });

  it("and stops a little outside the frame, so it stays grabbable", () => {
    expect(dragged(start, at(0, 0), at(9999, 9999), FRAME).x).toBe(LAYER_POS_MAX);
    expect(dragged(start, at(0, 0), at(-9999, -9999), FRAME).y).toBe(LAYER_POS_MIN);
  });

  it("a frame with no size moves nothing rather than dividing by zero", () => {
    expect(dragged(start, at(0, 0), at(50, 50), { width: 0, height: 0 })).toEqual(start);
  });

  it("and it changes nothing but position", () => {
    const moved = dragged({ ...start, scale: 1.4, rotation: 22 }, at(0, 0), at(10, 10), FRAME);
    expect(moved.scale).toBe(1.4);
    expect(moved.rotation).toBe(22);
  });
});

describe("pulling a corner", () => {
  const centre = at(100, 100);

  it("sizes by the ratio of the distance from the centre", () => {
    // Twice as far from the middle is twice the size, and the corner
    // stays under the finger.
    expect(pulled(start, centre, at(140, 100), at(180, 100)).scale).toBeCloseTo(2, 6);
    expect(pulled(start, centre, at(140, 100), at(120, 100)).scale).toBeCloseTo(0.5, 6);
  });

  it("clamped at both ends", () => {
    expect(pulled(start, centre, at(101, 100), at(9999, 100)).scale).toBe(LAYER_SCALE_MAX);
    expect(pulled(start, centre, at(9999, 100), at(101, 100)).scale).toBe(LAYER_SCALE_MIN);
  });

  it("and a grab exactly on the centre does not divide by zero", () => {
    // Both points on the centre is the case that bites: 0/0 is NaN, and
    // a clamp passes NaN straight through. A grab on the centre that
    // then moves is already saved by the clamp, so testing only that
    // proved nothing.
    expect(pulled(start, centre, centre, centre).scale).toBeGreaterThanOrEqual(LAYER_SCALE_MIN);
    expect(Number.isNaN(pulled(start, centre, centre, centre).scale)).toBe(false);
    expect(Number.isFinite(pulled(start, centre, centre, at(150, 100)).scale)).toBe(true);
  });
});

describe("swinging the handle", () => {
  const centre = at(100, 100);

  it("turns by the angle swept", () => {
    // Straight up to straight right is a quarter turn.
    expect(swung(start, centre, at(100, 40), at(160, 100)).rotation).toBe(90);
  });

  it("snaps to the eight obvious angles when it is nearly one", () => {
    expect(snapAngle(44)).toBe(SNAP_DEGREES);
    expect(snapAngle(46)).toBe(SNAP_DEGREES);
    // Far enough away and it is left exactly where it was put.
    expect(snapAngle(52)).toBe(52);
  });

  it("and wraps rather than sticking at 180", () => {
    expect(wrapDegrees(190)).toBe(-170);
    expect(wrapDegrees(-190)).toBe(170);
    expect(wrapDegrees(360)).toBe(0);
    expect(wrapDegrees(NaN)).toBe(0);
  });
});

describe("pinching", () => {
  it("sizes and turns together", () => {
    // Fingers twice as far apart, rotated a quarter turn.
    const out = pinched(start, at(0, 0), at(100, 0), at(0, 0), at(0, 200));
    expect(out.scale).toBeCloseTo(2, 6);
    expect(out.rotation).toBe(90);
  });

  it("measured from where the pinch began, not from the last frame", () => {
    // Accumulating per-frame ratios is how a slow pinch drifts.
    const once = pinched(start, at(0, 0), at(100, 0), at(0, 0), at(150, 0));
    const stepped = pinched(
      pinched(start, at(0, 0), at(100, 0), at(0, 0), at(120, 0)),
      at(0, 0), at(100, 0), at(0, 0), at(150, 0),
    );
    expect(once.scale).toBeCloseTo(1.5, 6);
    // The stepped one compounds, which is exactly what must not happen
    // to the real gesture — the component keeps the start points.
    expect(stepped.scale).not.toBeCloseTo(once.scale, 3);
  });

  it("two fingers in the same place say nothing about size", () => {
    const out = pinched({ ...start, scale: 1.7 }, at(50, 50), at(50, 50), at(0, 0), at(200, 0));
    expect(out.scale).toBe(1.7);
  });

  it("and it is clamped like every other way of sizing", () => {
    // Ten pixels apart, not one: a one-pixel gap is the degenerate case
    // the guard above deliberately ignores.
    expect(pinched(start, at(0, 0), at(10, 0), at(0, 0), at(9999, 0)).scale).toBe(LAYER_SCALE_MAX);
  });
});

describe("what a tap landed on", () => {
  const boxes = [
    { id: "under", left: 0, top: 0, width: 100, height: 100 },
    { id: "over", left: 50, top: 50, width: 100, height: 100 },
  ];

  it("the top one, because that is the one you can see", () => {
    expect(topmostAt(at(75, 75), boxes)).toBe("over");
  });

  it("the one underneath where nothing covers it", () => {
    expect(topmostAt(at(10, 10), boxes)).toBe("under");
  });

  it("and nothing where there is nothing", () => {
    expect(topmostAt(at(300, 300), boxes)).toBe(null);
    expect(topmostAt(at(0, 0), [])).toBe(null);
  });
});

describe("no box: the picture itself takes the gestures", () => {
  it("there is no selection box any more", () => {
    expect(existsSync("src/components/shows/TransformBox.tsx")).toBe(false);
    expect(editor).not.toContain("TransformBox");
  });

  it("the browser's own drag and scroll cannot cancel a finger mid-move", () => {
    // Found by driving it: a drag of the photo was an image drag, which
    // fired pointercancel after one step, so nothing could be moved.
    expect(editor).toContain('onDragStart={(e) => e.preventDefault()}');
    expect(editor).toContain('style={{ touchAction: "none" }}');
    expect(editor).toContain("draggable={false}");
  });

  it("a second finger turns whatever is held into a pinch", () => {
    expect(editor).toContain("const going = grip.current;");
    expect(editor).toContain("going.pinch = true;");
    expect(editor).toContain("const next = pinched(g.from, began.get(ids[0]) ?? a, began.get(ids[1]) ?? b, a, b);");
  });

  it("a still finger held down pops the colours up beside it", () => {
    expect(editor).toContain("const HOLD_MS = 420;");
    expect(editor).toContain("setHolding(id);");
    // On its right, or its left when the right edge is too close.
    expect(editor).toContain("const right = box.left + reach + 12 + 46 <= frame.width;");
  });

  it("let go over the bin and it is gone", () => {
    expect(editor).toContain("const binned = g.moved && !g.pinch && overBin(ev);");
    expect(editor).toContain("setLayers((l) => l.filter((layer) => layer.id !== g.id));");
  });
});

describe("the editor", () => {
  it("the colour wheel is one tap, the next colour", () => {
    expect(editor).toContain("paint(nextLook(chosen.type, chosen.look));");
    expect(editor).toContain("onClick={nextColour}");
  });

  it("a tap on nothing lets go of the selection", () => {
    expect(editor).toContain("if (!hit) {");
    expect(editor).toContain("setSelected(null);");
  });

  it("a new layer goes on top, because the list is back to front", () => {
    expect(editor).toContain("setLayers((l) => [...l, layer]);");
  });

  it("and the cap is the model's, not a second number", () => {
    expect(editor).toContain("if (layers.length >= MAX_LAYERS) return;");
  });

  it("what is published is what readLayers will accept", () => {
    // The editor holds layers in the same shape the column stores, so
    // the last thing before publishing is the same check the reader does.
    expect(editor).toContain("onPublish(readLayers(layers), strokes.length ? { strokes, frame } : null)");
  });

  it("an empty text layer removes itself rather than lurking invisibly", () => {
    expect(editor).toContain("if (!text.trim()) {");
    expect(editor).toContain("setLayers((l) => l.filter((layer) => layer.id !== id));");
  });

  it("and the selected layer is drawn like every other one, with no box", () => {
    expect(editor).toContain("<LayerView layer={layer} frame={frame} editing embeds={embeds} />");
    expect(editor).not.toContain("layer.id === selected ? null : (");
  });
});
