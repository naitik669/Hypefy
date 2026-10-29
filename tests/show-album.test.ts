import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ALBUM_MAX, addPicks, selectedPicks, toggleSelected } from "@/lib/show-album";

const img = (n: string, size = 1000) => new File([new Uint8Array(size)], `${n}.jpg`, { type: "image/jpeg" });
let i = 0;
const id = () => `p${i++}`;

describe("an album's picks", () => {
  it("come in the order they were chosen, all selected", () => {
    i = 0;
    const r = addPicks([], [img("a"), img("b")], id);
    expect(r.picks.map((p) => p.file.name)).toEqual(["a.jpg", "b.jpg"]);
    expect(r.selected).toEqual(["p0", "p1"]);
  });

  it("stop at the cap, and say how many were left out", () => {
    const many = Array.from({ length: ALBUM_MAX + 3 }, (_, n) => img(`f${n}`));
    const r = addPicks([], many, id);
    expect(r.picks).toHaveLength(ALBUM_MAX);
    expect(r.overCap).toBe(3);
  });

  it("refuse what cannot be a Show, by name, and keep the rest", () => {
    const huge = img("big", 200 * 1024 * 1024);
    const r = addPicks([], [huge, img("ok")], id);
    expect(r.picks.map((p) => p.file.name)).toEqual(["ok.jpg"]);
    expect(r.refused[0]).toMatch(/MB/);
  });

  it("taking one out moves the later ones up; putting it back puts it last", () => {
    const out = toggleSelected(["a", "b", "c"], "b");
    expect(out).toEqual(["a", "c"]);
    expect(toggleSelected(out, "b")).toEqual(["a", "c", "b"]);
  });

  it("cannot go past the cap by tapping", () => {
    const full = Array.from({ length: ALBUM_MAX }, (_, n) => `x${n}`);
    expect(toggleSelected(full, "new")).toBe(full);
  });

  it("selected picks come back in album order", () => {
    const picks = [{ id: "a", file: img("a") }, { id: "b", file: img("b") }];
    expect(selectedPicks(picks, ["b", "a"]).map((p) => p.id)).toEqual(["b", "a"]);
  });
});

describe("the album on screen", () => {
  const src = readFileSync("src/components/shows/AlbumSheet.tsx", "utf8");
  it("goes up through the same publish path as a single Show, one after another", () => {
    expect(src).toContain("const result = await publishShow(");
    expect(src).toContain("for (const [i, pick] of remaining.entries()) {");
  });
  it("a failure part-way says how many went up, and Share carries on with the rest", () => {
    expect(src).toContain("`${up} of ${total} went up. ${publishFailureMessage(result.reason)}`");
    expect(src).toContain("`Share the other ${remaining.length}`");
  });
});

describe("the Show camera", () => {
  const src = readFileSync("src/components/create/CreateScreen.tsx", "utf8");
  it("is already open when you arrive on Show, and when you switch to it", () => {
    expect(src).toContain('useState<"pick" | "camera">(initialMode === "show" ? "camera" : "pick")');
    expect(src).toContain('setSource(m.id === "show" ? "camera" : "pick");');
  });
  it("has Text and Album beside it, usable even when the camera is refused", () => {
    expect(src).toContain('<div className="absolute left-3 top-1/2 z-30 flex -translate-y-1/2 flex-col gap-3.5" data-show-rail>');
    expect(src).toContain("setWriting(true);");
    expect(src).toContain("albumRef.current?.click();");
    expect(src).toContain("Use your gallery");
  });
  it("a text Show goes through the same arrange step as a photo", () => {
    expect(src).toContain("// Into the same arrange step a photo goes through.\n          startWith(file);");
  });
});
