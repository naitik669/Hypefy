/**
 * Photo filters for the camera.
 *
 * Each filter is a short list of CSS filter functions plus an optional colour
 * wash. The live viewfinder uses the CSS form (GPU, free); the saved photo is
 * drawn through the same list, with canvas `filter` where the browser has it
 * and the Filter Effects spec's own matrices where it doesn't, so what you
 * see is what gets posted.
 */

export type FilterOp =
  | ["brightness", number]
  | ["contrast", number]
  | ["saturate", number]
  | ["sepia", number]
  | ["grayscale", number]
  | ["hue-rotate", number]; // degrees

export type PhotoFilter = {
  id: string;
  name: string;
  ops: FilterOp[];
  /** A thin wash of colour over the whole picture: [r, g, b] and its opacity. */
  tint?: { rgb: [number, number, number]; alpha: number };
};

export const NORMAL: PhotoFilter = { id: "normal", name: "Normal", ops: [] };

export const PHOTO_FILTERS: PhotoFilter[] = [
  NORMAL,
  { id: "vivid", name: "Vivid", ops: [["saturate", 1.45], ["contrast", 1.1]] },
  { id: "golden", name: "Golden", ops: [["sepia", 0.25], ["saturate", 1.25], ["brightness", 1.05]], tint: { rgb: [255, 170, 60], alpha: 0.08 } },
  { id: "cool", name: "Cool", ops: [["saturate", 1.1], ["hue-rotate", -12], ["brightness", 1.03]], tint: { rgb: [60, 140, 255], alpha: 0.1 } },
  { id: "hype", name: "Hype", ops: [["saturate", 1.2], ["contrast", 1.08]], tint: { rgb: [163, 230, 53], alpha: 0.1 } },
  { id: "punch", name: "Punch", ops: [["contrast", 1.25], ["saturate", 1.3], ["brightness", 0.98]] },
  { id: "rose", name: "Rose", ops: [["saturate", 1.15], ["hue-rotate", -8]], tint: { rgb: [255, 90, 150], alpha: 0.1 } },
  { id: "dusk", name: "Dusk", ops: [["contrast", 1.05], ["saturate", 1.2], ["hue-rotate", 12]], tint: { rgb: [120, 70, 255], alpha: 0.12 } },
  { id: "vintage", name: "Vintage", ops: [["sepia", 0.45], ["contrast", 0.9], ["brightness", 1.05], ["saturate", 0.85]] },
  { id: "fade", name: "Fade", ops: [["contrast", 0.82], ["brightness", 1.1], ["saturate", 0.8]] },
  { id: "mono", name: "Mono", ops: [["grayscale", 1], ["contrast", 1.1]] },
  { id: "noir", name: "Noir", ops: [["grayscale", 1], ["contrast", 1.5], ["brightness", 0.9]] },
];

export function filterById(id: string | null | undefined): PhotoFilter {
  return PHOTO_FILTERS.find((f) => f.id === id) ?? NORMAL;
}

/** The CSS `filter` value, or "none". */
export function filterCss(f: PhotoFilter): string {
  if (!f.ops.length) return "none";
  return f.ops.map(([k, v]) => (k === "hue-rotate" ? `hue-rotate(${v}deg)` : `${k}(${v})`)).join(" ");
}

export function tintCss(f: PhotoFilter): string | null {
  if (!f.tint) return null;
  const [r, g, b] = f.tint.rgb;
  return `rgba(${r}, ${g}, ${b}, ${f.tint.alpha})`;
}

type M = [number, number, number, number, number, number, number, number, number];

/** The 3x3 colour matrix for one op, straight from the Filter Effects spec. */
function matrix([k, v]: FilterOp): M | null {
  switch (k) {
    case "grayscale": {
      const s = 1 - Math.min(1, v);
      return [
        0.2126 + 0.7874 * s, 0.7152 - 0.7152 * s, 0.0722 - 0.0722 * s,
        0.2126 - 0.2126 * s, 0.7152 + 0.2848 * s, 0.0722 - 0.0722 * s,
        0.2126 - 0.2126 * s, 0.7152 - 0.7152 * s, 0.0722 + 0.9278 * s,
      ];
    }
    case "sepia": {
      const s = 1 - Math.min(1, v);
      return [
        0.393 + 0.607 * s, 0.769 - 0.769 * s, 0.189 - 0.189 * s,
        0.349 - 0.349 * s, 0.686 + 0.314 * s, 0.168 - 0.168 * s,
        0.272 - 0.272 * s, 0.534 - 0.534 * s, 0.131 + 0.869 * s,
      ];
    }
    case "saturate":
      return [
        0.213 + 0.787 * v, 0.715 - 0.715 * v, 0.072 - 0.072 * v,
        0.213 - 0.213 * v, 0.715 + 0.285 * v, 0.072 - 0.072 * v,
        0.213 - 0.213 * v, 0.715 - 0.715 * v, 0.072 + 0.928 * v,
      ];
    case "hue-rotate": {
      const a = (v * Math.PI) / 180;
      const c = Math.cos(a);
      const s = Math.sin(a);
      return [
        0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
        0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
        0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
      ];
    }
    default:
      return null;
  }
}

/**
 * Apply a filter's ops to RGBA pixels in place — the fallback for browsers
 * whose canvas has no `filter`. Each op clamps, as the browser's does.
 */
export function applyFilterPixels(data: Uint8ClampedArray, f: PhotoFilter) {
  for (const op of f.ops) {
    const m = matrix(op);
    if (m) {
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        data[i] = m[0] * r + m[1] * g + m[2] * b;
        data[i + 1] = m[3] * r + m[4] * g + m[5] * b;
        data[i + 2] = m[6] * r + m[7] * g + m[8] * b;
      }
    } else {
      const [k, v] = op;
      // brightness: v·x; contrast: (x − ½)·v + ½. Uint8ClampedArray clamps and rounds.
      const off = k === "contrast" ? 127.5 * (1 - v) : 0;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = data[i] * v + off;
        data[i + 1] = data[i + 1] * v + off;
        data[i + 2] = data[i + 2] * v + off;
      }
    }
  }
}

/**
 * The carousel's order: favourites to the left of Normal (most recently
 * favourited nearest the middle), everything else to its right.
 */
export function carouselOrder(favorites: string[]): PhotoFilter[] {
  const favs = favorites
    .map((id) => PHOTO_FILTERS.find((f) => f.id === id && f.id !== NORMAL.id))
    .filter((f): f is PhotoFilter => !!f);
  const favIds = new Set(favs.map((f) => f.id));
  const rest = PHOTO_FILTERS.filter((f) => f.id !== NORMAL.id && !favIds.has(f.id));
  // Stored oldest first, so the newest ends up next to Normal.
  return [...favs, NORMAL, ...rest];
}

export function toggleFavorite(favorites: string[], id: string): string[] {
  if (id === NORMAL.id) return favorites;
  return favorites.includes(id) ? favorites.filter((f) => f !== id) : [...favorites, id];
}

const KEY = "hypefy:filter-favorites";

export function loadFavorites(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function saveFavorites(favorites: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(favorites));
  } catch {
    // Private mode or storage blocked: favourites last for this visit only.
  }
}
