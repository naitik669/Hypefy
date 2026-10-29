/**
 * What is arranged on top of a Show.
 *
 * A Show was one picture and a caption. It becomes a picture and an
 * ordered list of layers — words, a sticker, a song, a poll, somebody's
 * name — stored as jsonb and rendered live rather than flattened into the
 * image at publish. That is what keeps a poll votable, a song playable, a
 * mention tappable and a post embed real, and what lets a Show be edited
 * afterwards. Flattening happens only when somebody saves the picture out,
 * through the compositor page-image.ts already has.
 *
 * **Positions are fractions of the frame, never pixels.** The same choice
 * framePlacement makes for avatar frames ("stored in avatar widths and
 * degrees, so a frame placed once is placed everywhere"), for the same
 * reason: one Show has to come out right in the editor, in the
 * full-screen viewer, in a ring preview and in an exported image, and
 * those are four different widths.
 *
 * `readLayers` is deliberately unforgiving and never throws. A jsonb
 * column can hold a row written by an older client, a half-written row,
 * or one from a version that does not exist yet; all of those have to
 * read as "not a layer" and leave the picture standing, which is the
 * stance readPoll already takes for the same reason.
 */

import {
  MAX_POLL_OPTION,
  MAX_POLL_OPTIONS,
  MAX_POLL_QUESTION,
  MIN_POLL_OPTIONS,
  tidyOptions,
} from "@/lib/chat-poll";

export const LAYER_TYPES = [
  "text",
  "sticker",
  "music",
  "mention",
  "link",
  "poll",
  "question",
  "post",
  "shot",
] as const;

export type LayerType = (typeof LAYER_TYPES)[number];

/**
 * How many layers one Show may carry.
 *
 * Not a storage limit — twelve of these is a few kilobytes. It is a
 * legibility limit: past about a dozen the picture underneath has gone.
 */
export const MAX_LAYERS = 12;

/**
 * The same bounds the frame placer uses, stated here rather than imported
 * from a component under admin/. A quarter size is still readable; three
 * times is most of the frame.
 */
export const LAYER_SCALE_MIN = 0.25;
export const LAYER_SCALE_MAX = 3;

/** How far outside the frame a layer's centre may sit, so it stays grabbable. */
export const LAYER_POS_MIN = -0.1;
export const LAYER_POS_MAX = 1.1;

/** The longest a text layer can be before it stops being a story. */
export const MAX_LAYER_TEXT = 200;

/**
 * How many looks each type cycles through on a tap.
 *
 * The index is stored, never the styling, so restyling a look later
 * reaches every Show already posted rather than only new ones.
 */
export const LOOKS: Record<LayerType, number> = {
  text: 4,
  sticker: 4,
  music: 4,
  mention: 4,
  link: 4,
  poll: 4,
  question: 4,
  post: 4,
  shot: 4,
};

export type TextPayload = { text: string };
export type StickerPayload = { emoji: string };
export type MusicPayload = {
  id: string;
  title: string;
  artist: string;
  artwork: string | null;
  preview: string | null;
};
export type MentionPayload = { username: string };
export type LinkPayload = { url: string };
export type PollPayload = { question: string; options: string[] };
export type QuestionPayload = { prompt: string };
export type PostPayload = { postId: string };
export type ShotPayload = { shotId: string };

export type LayerPayload =
  | TextPayload
  | StickerPayload
  | MusicPayload
  | MentionPayload
  | LinkPayload
  | PollPayload
  | QuestionPayload
  | PostPayload
  | ShotPayload;

export type ShowLayer = {
  /** Stable for the life of the layer: votes and answers point at it. */
  id: string;
  type: LayerType;
  /** The layer's centre, as a fraction of the frame. */
  x: number;
  y: number;
  scale: number;
  /** Degrees, positive clockwise. */
  rotation: number;
  /** Which of this type's looks is showing. */
  look: number;
  payload: LayerPayload;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** A trimmed string of at most `max`, or null if there is nothing left. */
function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  // Control characters and newlines collapse: a layer is drawn in a box
  // on a picture, and a run of newlines is a way to push it off one.
  const clean = value.replace(/[\s\u0000-\u001f\u007f]+/g, " ").trim();
  if (!clean) return null;
  return clean.slice(0, max);
}

/**
 * How many characters a reader would count.
 *
 * Not code points: "👩‍👩‍👧" is five of those and one of these. Segmenter
 * is present everywhere the app runs, but the fallback keeps a server
 * render or an old WebView from throwing on a sticker.
 */
function graphemes(value: string): number {
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    return [...new Intl.Segmenter().segment(value)].length;
  }
  return [...value].length;
}

/** A string that is plausibly an id, without pretending to check a uuid. */
function id(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  if (!clean || clean.length > 64) return null;
  return clean;
}

/**
 * The payload for one type, or null if it is not one.
 *
 * Every field is checked. A payload that is half right is not half
 * rendered — the layer is dropped, because a music chip with no title is
 * a worse thing to draw than nothing.
 */
function readPayload(type: LayerType, raw: unknown): LayerPayload | null {
  if (typeof raw !== "object" || raw === null) return null;
  const p = raw as Record<string, unknown>;

  switch (type) {
    case "text": {
      const t = text(p.text, MAX_LAYER_TEXT);
      return t ? { text: t } : null;
    }
    case "sticker": {
      // One character as a reader counts them, which is not one code
      // point: a family emoji is five joined by zero-width joiners, and
      // counting code points refused it. Intl.Segmenter is already how
      // StatusComposer and caption-runs count these.
      const e = typeof p.emoji === "string" ? p.emoji.trim() : "";
      if (!e || graphemes(e) > 1) return null;
      return { emoji: e };
    }
    case "music": {
      const tid = id(p.id);
      const title = text(p.title, 120);
      const artist = text(p.artist, 120);
      if (!tid || !title || !artist) return null;
      return {
        id: tid,
        title,
        artist,
        artwork: typeof p.artwork === "string" ? p.artwork : null,
        preview: typeof p.preview === "string" ? p.preview : null,
      };
    }
    case "mention": {
      const u = typeof p.username === "string" ? p.username.trim().toLowerCase() : "";
      // The shape the app's own handles take; see extractMentions.
      if (!/^[a-z0-9_.]{1,32}$/.test(u)) return null;
      return { username: u };
    }
    case "link": {
      const url = typeof p.url === "string" ? p.url.trim() : "";
      // Whether the host is one we will unfurl is link-preview's job, and
      // it is asked again at render. This only refuses what is not a URL.
      if (!/^https:\/\/[^\s]+$/i.test(url) || url.length > 2048) return null;
      return { url };
    }
    case "poll": {
      const question = text(p.question, MAX_POLL_QUESTION);
      const options = Array.isArray(p.options)
        ? tidyOptions(p.options.filter((o): o is string => typeof o === "string"))
        : [];
      if (!question) return null;
      if (options.length < MIN_POLL_OPTIONS || options.length > MAX_POLL_OPTIONS) return null;
      if (options.some((o) => o.length > MAX_POLL_OPTION)) return null;
      return { question, options };
    }
    case "question": {
      const prompt = text(p.prompt, MAX_POLL_QUESTION);
      return prompt ? { prompt } : null;
    }
    case "post": {
      const pid = id(p.postId);
      return pid ? { postId: pid } : null;
    }
    case "shot": {
      const sid = id(p.shotId);
      return sid ? { shotId: sid } : null;
    }
  }
}

/** One layer, or null. */
function readLayer(raw: unknown, seen: Set<string>): ShowLayer | null {
  if (typeof raw !== "object" || raw === null) return null;
  const l = raw as Record<string, unknown>;

  const lid = id(l.id);
  if (!lid || seen.has(lid)) return null;

  const type = LAYER_TYPES.find((t) => t === l.type);
  if (!type) return null;

  const payload = readPayload(type, l.payload);
  if (!payload) return null;

  const looks = LOOKS[type];
  const look = Math.trunc(num(l.look, 0));

  return {
    id: lid,
    type,
    x: clamp(num(l.x, 0.5), LAYER_POS_MIN, LAYER_POS_MAX),
    y: clamp(num(l.y, 0.5), LAYER_POS_MIN, LAYER_POS_MAX),
    scale: clamp(num(l.scale, 1), LAYER_SCALE_MIN, LAYER_SCALE_MAX),
    // Wrapped rather than clamped: turning a sticker all the way round
    // should come back to where it started, not stick at 180.
    rotation: ((((num(l.rotation, 0) + 180) % 360) + 360) % 360) - 180,
    // Out of range reads as the first look rather than as no layer: a
    // look added and later removed should not delete somebody's Show.
    look: look >= 0 && look < looks ? look : 0,
    payload,
  };
}

/**
 * Every layer this Show really has, in order, back to front.
 *
 * Never throws and never returns a half-built layer. Anything it does not
 * recognise is left out, and the picture renders without it.
 */
export function readLayers(value: unknown): ShowLayer[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: ShowLayer[] = [];
  for (const raw of value) {
    if (out.length >= MAX_LAYERS) break;
    const layer = readLayer(raw, seen);
    if (!layer) continue;
    seen.add(layer.id);
    out.push(layer);
  }
  return out;
}

/**
 * Where to draw a layer inside a frame of this size.
 *
 * The centre is the anchor, so scaling and turning happen about the thing
 * itself and the other two are untouched — the same composition
 * framePlacement relies on.
 */
export function layerBox(
  layer: Pick<ShowLayer, "x" | "y" | "scale" | "rotation">,
  frame: { width: number; height: number },
): { left: number; top: number; transform: string } {
  return {
    left: layer.x * frame.width,
    top: layer.y * frame.height,
    transform: `translate(-50%, -50%) rotate(${layer.rotation}deg) scale(${layer.scale})`,
  };
}

/** The next look, wrapping — what one tap on a layer does. */
export function nextLook(type: LayerType, look: number): number {
  const looks = LOOKS[type];
  const at = Number.isFinite(look) ? Math.trunc(look) : 0;
  return ((at + 1) % looks + looks) % looks;
}
