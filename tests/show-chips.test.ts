import { describe, it, expect } from "vitest";
import { cleanTag, readLayers, typedPayload, typedValue, type ShowLayer } from "@/lib/show-layers";
import { lookFor, usesColours } from "@/lib/show-looks";

const layer = (type: string, payload: unknown) => ({ id: `${type}1`, type, x: 0.5, y: 0.5, scale: 1, rotation: 0, look: 0, payload });

describe("location, hashtag and time stickers", () => {
  it("are read back when they are well formed", () => {
    const out = readLayers([
      layer("location", { place: "  Mumbai  " }),
      layer("hashtag", { tag: "Weekend" }),
      layer("time", { at: "2026-10-30T16:11:00.000Z" }),
    ]);
    expect(out.map((l) => l.payload)).toEqual([{ place: "Mumbai" }, { tag: "weekend" }, { at: "2026-10-30T16:11:00.000Z" }]);
  });

  it("and dropped when they are not", () => {
    expect(readLayers([layer("location", { place: "   " })])).toEqual([]);
    expect(readLayers([layer("hashtag", { tag: "#  !!" })])).toEqual([]);
    expect(readLayers([layer("time", { at: "not a time" })])).toEqual([]);
  });

  it("a typed hashtag becomes one: no #, no spaces or punctuation, lower case", () => {
    expect(cleanTag("#Late Night!")).toBe("latenight");
    expect(cleanTag("##chai_time")).toBe("chai_time");
    expect(cleanTag("नमस्ते")).toBe("नमस्ते");
  });

  it("typing goes into each one's own field", () => {
    expect(typedPayload("location", "Goa")).toEqual({ place: "Goa" });
    expect(typedPayload("hashtag", "#Goa Trip")).toEqual({ tag: "goatrip" });
    expect(typedValue({ ...layer("location", { place: "Goa" }) } as ShowLayer)).toBe("Goa");
  });

  it("all three wear the eight colours, on squircle corners", () => {
    for (const t of ["location", "hashtag", "time"] as const) {
      expect(usesColours(t)).toBe(true);
      expect(lookFor(t, 3).box.borderRadius).toBe(14);
    }
  });
});
