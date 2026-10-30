import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { placeFrom, placesFrom } from "@/lib/places";
import { cleanUsername, linkFrom, readLayers, typedPayload } from "@/lib/show-layers";

const editor = readFileSync("src/components/shows/ShowEditor.tsx", "utf8");

describe("a place, with the rest of its address filled in", () => {
  it("takes a city's name from its address, and the larger places it sits in under it", () => {
    expect(
      placeFrom({ name: "Meerut", address: { city: "Meerut", state: "Uttar Pradesh", country: "India" } }),
    ).toEqual({ name: "Meerut", area: "Uttar Pradesh, India" });
  });

  it("keeps a place's own name and says which city it is in", () => {
    expect(
      placeFrom({ name: "Golden Gate Park", address: { city: "San Francisco", state: "California", country: "United States" } }),
    ).toEqual({ name: "Golden Gate Park", area: "San Francisco, California, United States" });
  });

  it("falls back to the address when a result has no name", () => {
    expect(placeFrom({ address: { town: "Hapur", state: "Uttar Pradesh", country: "India" } })?.name).toBe("Hapur");
  });

  it("drops what is not a place, and repeats", () => {
    expect(placeFrom(null)).toBeNull();
    expect(placeFrom({})).toBeNull();
    const same = { name: "Meerut", address: { state: "Uttar Pradesh", country: "India" } };
    expect(placesFrom([same, same, "x"])).toHaveLength(1);
    expect(placesFrom("nope")).toEqual([]);
  });

  it("the sticker keeps the area, within its length", () => {
    const [layer] = readLayers([
      { id: "a", type: "location", x: 0.5, y: 0.5, scale: 1, rotation: 0, payload: { place: "Meerut", area: "Uttar Pradesh, India" } },
    ]);
    expect(layer.payload).toEqual({ place: "Meerut", area: "Uttar Pradesh, India" });
  });
});

describe("people and links are typed on their stickers too", () => {
  it("a handle is cleaned as it is typed", () => {
    expect(cleanUsername("@Naitik.K!")).toBe("naitik.k");
    expect(typedPayload("mention", "@Maya")).toEqual({ username: "maya" });
  });

  it("a link gets its scheme, and what is not a link is refused", () => {
    expect(linkFrom("hypefy.app/naitik")).toBe("https://hypefy.app/naitik");
    expect(linkFrom("http://example.com")).toBe("https://example.com");
    expect(linkFrom("not a link")).toBe("");
    expect(linkFrom("localhost")).toBe("");
  });

  it("the editor opens the writer rather than a sheet", () => {
    expect(editor).toContain('if (key === "location" || key === "hashtag" || key === "mention" || key === "link") {');
    expect(editor).toContain("if (id) setTagging(id);");
    expect(editor).not.toContain("<MentionSheet");
    expect(editor).not.toContain("<LinkSheet");
  });

  it("and a tag that says nothing goes rather than sitting there empty", () => {
    expect(editor).toContain("return typedValue(next).trim() ? [next] : [];");
    expect(editor).toContain("return url ? [{ ...next, payload: { url } }] : [];");
  });
});

describe("the places route", () => {
  const route = readFileSync("src/app/api/places/route.ts", "utf8");
  it("is signed in and capped, and names itself to OpenStreetMap", () => {
    expect(route).toContain('await guardApi("places")');
    expect(route).toContain('"user-agent": "Hypefy/1.0 (+https://hypefy.app)"');
  });
  it("and the cap exists in the database", () => {
    expect(readFileSync("supabase/migrations/0190_rate_limit_places.sql", "utf8")).toContain(
      "when 'places'       then v_limit := 200;",
    );
  });
});
