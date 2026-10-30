/**
 * Places, as a Show's location sticker names them: the place itself, and
 * the rest of the address under it — "Meerut" over "Uttar Pradesh, India".
 *
 * Looked up through OpenStreetMap's Nominatim, which is free and asks two
 * things in return: no more than one request a second, and a credit line.
 * The route that calls it is capped per person and the client waits for a
 * pause in the typing; the credit sits under the suggestions.
 */

export type Place = { name: string; area: string };

/** Longest name and area kept, matching what the sticker will hold. */
export const MAX_PLACE_NAME = 60;
export const MAX_PLACE_AREA = 80;

const NAME_KEYS = [
  "city",
  "town",
  "village",
  "hamlet",
  "suburb",
  "neighbourhood",
  "municipality",
  "county",
  "state",
  "country",
] as const;

type Raw = {
  name?: unknown;
  display_name?: unknown;
  address?: Record<string, unknown>;
};

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * One Nominatim result as a place, or null.
 *
 * The place's own name wins (a café, a park, a stadium); a result that is
 * itself a city has no name of its own beyond the city, so the address is
 * read for it. The area is the larger places it sits in, without repeating
 * the name.
 */
export function placeFrom(raw: unknown): Place | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  const address = r.address && typeof r.address === "object" ? r.address : {};
  const name =
    str(r.name) ||
    NAME_KEYS.map((k) => str(address[k])).find(Boolean) ||
    str(r.display_name).split(",")[0]?.trim() ||
    "";
  if (!name) return null;

  const city = str(address.city) || str(address.town) || str(address.village);
  const parts = [city, str(address.state), str(address.country)].filter(
    (p, i, all) => p && p !== name && all.indexOf(p) === i,
  );
  return {
    name: name.slice(0, MAX_PLACE_NAME),
    area: parts.join(", ").slice(0, MAX_PLACE_AREA),
  };
}

/** A list of results, as places, without repeats. */
export function placesFrom(raw: unknown): Place[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Place[] = [];
  for (const r of raw) {
    const p = placeFrom(r);
    if (!p) continue;
    const key = `${p.name}|${p.area}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}
