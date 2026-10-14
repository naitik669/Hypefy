/**
 * The tiles under Browse in the song picker.
 *
 * Each is a search, not a genre the catalogue knows about: the songs come
 * from Apple's search endpoint, which has no mood filter, so "Chill" means
 * "run this query" and nothing more. That is worth saying plainly — it
 * keeps the grid honest, costs no new service, and any tile can be
 * retuned by changing one string here.
 *
 * Trending is the exception and is handled by the picker itself, from
 * what Hypefy's own sounds are being used on.
 */

export type SoundCategory = {
  /** What the tile says. */
  label: string;
  /** What tapping it searches for. */
  query: string;
  /** Two stops, dark enough for the label's near-black to read on them. */
  from: string;
  to: string;
};

export const SOUND_CATEGORIES: readonly SoundCategory[] = [
  { label: "Hindi", query: "bollywood hits", from: "#f0abfc", to: "#86198f" },
  { label: "Chill", query: "lofi chill beats", from: "#7dd3fc", to: "#0369a1" },
  { label: "Hype", query: "hype rap bangers", from: "#fdba74", to: "#c2410c" },
  { label: "Sad", query: "sad slowed songs", from: "#a5b4fc", to: "#3730a3" },
  { label: "Love", query: "love songs romantic", from: "#fda4af", to: "#9f1239" },
  { label: "Punjabi", query: "punjabi hits", from: "#86efac", to: "#15803d" },
];
