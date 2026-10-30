/**
 * How each layer is dressed, and what one tap changes.
 *
 * Tapping a layer runs it through its looks — the gesture everyone
 * already knows from every sticker they have used. A look is one whole
 * appearance, shape *and* colour together, never a shape menu plus a
 * separate colour menu: two independent pickers is how people end up with
 * combinations that look broken, and one list of finished looks cannot.
 *
 * The layer stores only the index (`look`), so restyling a look later
 * reaches every Show already posted rather than only new ones.
 *
 * Pure, and shared by the editor and the viewer, so what you arrange is
 * what people see. card-image.ts records what happens otherwise: "this
 * file and HypefyIdFace are a pair: a change to one is a change to both."
 */

import type { CSSProperties } from "react";
import { AMBIENT_LOOK, LOOKS, type LayerType } from "@/lib/show-layers";

const LIME = "#a3e635";
const GOLD = "#ffd000";
const INK = "#0a0a0a";
const WHITE = "#ffffff";

/** One finished appearance. A renderer reads only the slots it has. */
export type Look = {
  /** What the editor calls it, under the layer. */
  name: string;
  /** The container. */
  box: CSSProperties;
  /** The main words. */
  title: CSSProperties;
  /** The quieter line beneath, where a layer has one. */
  sub: CSSProperties;
  /** Icons and rules drawn inside it. */
  ink: string;
};

/** Legible over a bright photo without a plate behind it. */
const OVER_PHOTO = "0 2px 14px rgba(0,0,0,0.65)";

const GLASS: CSSProperties = {
  background: "rgba(10,10,10,0.64)",
  border: "1px solid rgba(255,255,255,0.15)",
  backdropFilter: "blur(10px)",
};

/** Where the Ambient look has no stored colour yet: a neutral deep grey. */
export const AMBIENT_FALLBACK = "#3a3a3a";

/**
 * The eight colours a chip or a card wears, in the order the editor's row
 * shows them. One list for both shapes; only the corner differs, and it is
 * a squircle either way — the brand's corner, not a pill.
 *
 * Night stays first so a Show posted before this keeps its default.
 */
function colourLooks(radius: number, padding: CSSProperties["padding"]): Look[] {
  const on = (background: string, light: boolean): Pick<Look, "title" | "sub" | "ink"> =>
    light
      ? { title: { color: INK, fontWeight: 800 }, sub: { color: "rgba(10,10,10,0.62)" }, ink: INK }
      : { title: { color: WHITE, fontWeight: 800 }, sub: { color: "rgba(255,255,255,0.78)" }, ink: WHITE };
  return [
    {
      name: "Night",
      box: { ...GLASS, borderRadius: radius, padding },
      title: { color: WHITE, fontWeight: 800 },
      sub: { color: "#cfcfcf" },
      ink: LIME,
    },
    { name: "Lime", box: { background: "linear-gradient(135deg, #a3e635, #22c55e)", borderRadius: radius, padding }, ...on("", true) },
    {
      name: "Glass",
      box: {
        background: "rgba(255,255,255,0.2)",
        border: "1px solid rgba(255,255,255,0.45)",
        backdropFilter: "blur(12px)",
        borderRadius: radius,
        padding,
      },
      title: { color: WHITE, fontWeight: 800, textShadow: "0 1px 3px rgba(0,0,0,0.35)" },
      sub: { color: "rgba(255,255,255,0.88)", textShadow: "0 1px 3px rgba(0,0,0,0.35)" },
      ink: WHITE,
    },
    { name: "White", box: { background: WHITE, borderRadius: radius, padding }, title: { color: INK, fontWeight: 800 }, sub: { color: "#525252" }, ink: INK },
    // The ground is the layer's own tint, filled in by lookFor.
    { name: "Ambient", box: { background: AMBIENT_FALLBACK, borderRadius: radius, padding }, ...on("", false) },
    { name: "Sunset", box: { background: "linear-gradient(135deg, #f97316, #db2777)", borderRadius: radius, padding }, ...on("", false) },
    { name: "Aurora", box: { background: "linear-gradient(135deg, #6366f1, #0ea5e9)", borderRadius: radius, padding }, ...on("", false) },
    { name: "Grape", box: { background: "linear-gradient(135deg, #f472b6, #a855f7)", borderRadius: radius, padding }, ...on("", false) },
  ];
}

/** The swatch each colour shows in the editor's row. */
export const COLOUR_SWATCHES: { name: string; background: string }[] = [
  { name: "Night", background: "#111111" },
  { name: "Lime", background: "linear-gradient(135deg, #a3e635, #22c55e)" },
  { name: "Glass", background: "rgba(255,255,255,0.28)" },
  { name: "White", background: WHITE },
  { name: "Ambient", background: AMBIENT_FALLBACK },
  { name: "Sunset", background: "linear-gradient(135deg, #f97316, #db2777)" },
  { name: "Aurora", background: "linear-gradient(135deg, #6366f1, #0ea5e9)" },
  { name: "Grape", background: "linear-gradient(135deg, #f472b6, #a855f7)" },
];

/** Card layers — a box you answer. */
const CARD_LOOKS = colourLooks(22, 14);
/** Chip layers — a line or two. Squircle, 14 at chip height. */
const CHIP_LOOKS = colourLooks(14, "7px 14px");

/** Somebody else's post or Shot, carried into a Show. */
function embedLooks(): Look[] {
  return [
    {
      name: "Card",
      box: { background: "#141414", border: "1px solid #2a2a2a", borderRadius: 16, width: 158 },
      title: { color: WHITE, fontWeight: 800 },
      sub: { color: "#8a8a8a" },
      ink: WHITE,
    },
    {
      name: "Polaroid",
      box: {
        background: "#f5f3ec",
        borderRadius: 4,
        width: 150,
        padding: "8px 8px 0",
        boxShadow: "0 10px 26px rgba(0,0,0,0.5)",
      },
      title: { color: "#1a1a1a", fontWeight: 800 },
      sub: { color: "#4a4a4a" },
      ink: "#4a4a4a",
    },
    {
      name: "Row",
      box: { ...GLASS, borderRadius: 14, width: 232, padding: "9px 13px 9px 9px" },
      title: { color: WHITE, fontWeight: 800 },
      sub: { color: "#cfcfcf" },
      ink: WHITE,
    },
    {
      name: "Cover",
      box: { border: `2px solid ${LIME}`, borderRadius: 16, width: 150, overflow: "hidden" },
      title: { color: INK, fontWeight: 800 },
      // The bar carries its own ground. Without it the dark words sat
      // straight on the dark picture at a measured contrast of 1.0 —
      // the same colour as what was behind them, so the caption was
      // simply not there.
      sub: { color: INK, background: LIME },
      ink: LIME,
    },
  ];
}

/** Words on the picture. */
const TEXT_LOOKS: Look[] = [
  {
    name: "Plain",
    box: {},
    title: { color: WHITE, textShadow: OVER_PHOTO },
    sub: {},
    ink: WHITE,
  },
  {
    name: "Plate",
    box: { background: LIME, borderRadius: 10, padding: "6px 14px" },
    title: { color: INK },
    sub: {},
    ink: INK,
  },
  {
    name: "Outline",
    box: {},
    title: { color: "transparent", WebkitTextStroke: `1.6px ${LIME}` } as CSSProperties,
    sub: {},
    ink: LIME,
  },
  {
    name: "Glow",
    box: {},
    title: {
      color: GOLD,
      textShadow: "0 0 16px rgba(255,208,0,0.75), 0 0 34px rgba(255,208,0,0.45)",
    },
    sub: {},
    ink: GOLD,
  },
];

/** An emoji, bare or on a plate. */
const STICKER_LOOKS: Look[] = [
  {
    name: "Bare",
    box: { filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.55))" },
    title: {},
    sub: {},
    ink: WHITE,
  },
  {
    name: "Squircle",
    // The same corner the avatars and the music case use.
    box: { background: LIME, borderRadius: "30%", padding: 14 },
    title: {},
    sub: {},
    ink: INK,
  },
  {
    name: "Night",
    box: { ...GLASS, borderRadius: "50%", padding: 14 },
    title: {},
    sub: {},
    ink: WHITE,
  },
  {
    name: "Ring",
    box: { border: `3px solid ${WHITE}`, borderRadius: "50%", padding: 12 },
    title: {},
    sub: {},
    ink: WHITE,
  },
];

const BY_TYPE: Record<LayerType, Look[]> = {
  text: TEXT_LOOKS,
  sticker: STICKER_LOOKS,
  music: CHIP_LOOKS,
  mention: CHIP_LOOKS,
  link: CHIP_LOOKS,
  poll: CARD_LOOKS,
  question: CARD_LOOKS,
  location: CHIP_LOOKS,
  hashtag: CHIP_LOOKS,
  time: CHIP_LOOKS,
  post: embedLooks(),
  shot: embedLooks(),
};

/**
 * The look this layer is wearing.
 *
 * An index out of range reads as the first rather than throwing:
 * readLayers already clamps it, but this is also called straight from the
 * editor while somebody is cycling.
 */
export function lookFor(type: LayerType, look: number, tint?: string): Look {
  const list = BY_TYPE[type];
  const at = Number.isFinite(look) ? Math.trunc(look) : 0;
  const chosen = list[at >= 0 && at < list.length ? at : 0];
  // Ambient wears the layer's own colour, when it has one.
  if (tint && list.length > AMBIENT_LOOK && chosen === list[AMBIENT_LOOK]) {
    return { ...chosen, box: { ...chosen.box, background: tint } };
  }
  return chosen;
}

/** Whether a type picks from the eight colours rather than cycling looks. */
export function usesColours(type: LayerType): boolean {
  return BY_TYPE[type] === CARD_LOOKS || BY_TYPE[type] === CHIP_LOOKS;
}

/** What the editor writes under the layer while it is selected. */
export function lookName(type: LayerType, look: number): string {
  return lookFor(type, look).name;
}

/** How many looks a type has, as the styling actually provides them. */
export function lookCount(type: LayerType): number {
  return BY_TYPE[type].length;
}

/**
 * Every type's styling matches what show-layers promises.
 *
 * LOOKS is what the stored index is validated against; this file is what
 * is actually drawn. If they disagree, a layer can hold a look that has
 * no appearance — so they are checked against each other rather than
 * being two numbers somebody keeps in step by hand.
 */
export function looksAgree(): boolean {
  return (Object.keys(BY_TYPE) as LayerType[]).every((t) => BY_TYPE[t].length === LOOKS[t]);
}
