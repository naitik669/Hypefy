import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  HYPE_METER_AT,
  LAYER_TYPES,
  LOOKS,
  isEmbedType,
  isHypeMeter,
  readLayers,
  type ShowLayer,
  type SliderPayload,
} from "@/lib/show-layers";
import { lookFor } from "@/lib/show-looks";
import { ALL_TILES } from "@/components/shows/StickerTray";
import { cardEdge } from "@/components/shows/HypeCard";

/**
 * The two stickers that are Hypefy's rather than everyone's.
 *
 * The Hype card is somebody's ID as a sticker, and the Hype meter is the
 * slider with the Show's own hype wired to it. Both are deliberately small:
 * the card is a new layer type that keeps nothing but an id, and the meter is
 * not a layer type at all — a flag on the slider's payload, so every server
 * path that already knows the word "slider" keeps working untouched.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const view = read("src/components/shows/LayerView.tsx");
const viewer = read("src/components/shows/ShowViewer.tsx");
const stickers = read("src/components/shows/ShowStickers.tsx");
const card = read("src/components/shows/HypeCard.tsx");
const editor = read("src/components/shows/ShowEditor.tsx");

const layer = (over: Partial<ShowLayer> = {}): ShowLayer =>
  ({
    id: "l1",
    type: "hypecard",
    x: 0.5,
    y: 0.5,
    scale: 1,
    rotation: 0,
    look: 0,
    payload: { ownerId: "u1" },
    ...over,
  }) as ShowLayer;

describe("the Hype card carries nothing but an id", () => {
  it("an owner is all it keeps, and all it needs", () => {
    const [l] = readLayers([layer()]);
    expect(l.payload).toEqual({ ownerId: "u1" });
  });

  it("a card claiming a handle does not get to keep it", () => {
    // The whole reason it carries only an id: a credential that carries its
    // own claims is one anybody with the column grant can write.
    const [l] = readLayers([
      layer({ payload: { ownerId: "u1", username: "maya", memberNo: 1 } as never }),
    ]);
    expect(l.payload).toEqual({ ownerId: "u1" });
  });

  it("and with no owner there is no card", () => {
    expect(readLayers([layer({ payload: {} as never })])).toEqual([]);
  });

  it("it is not an embed, so placing one keeps your post", () => {
    // EMBED_TYPES replace one another, one to a Show. A card is not a thing
    // you posted, and losing an embed to it would be a surprise.
    expect(isEmbedType("hypecard")).toBe(false);
    expect(LAYER_TYPES).toContain("hypecard");
  });

  it("it wears the owner's accent and not one of the eight", () => {
    expect(LOOKS.hypecard).toBe(1);
    // And the one look carries no box: the plate draws its own frame, so an
    // embed's border round it would read as a card inside a card.
    expect(lookFor("hypecard", 0).name).toBe("Plate");
    expect(lookFor("hypecard", 0).box).toEqual({});
  });

  it("the edge takes the owner's hue, in Avatar's own formula", () => {
    expect(cardEdge(120)).toContain("hsl(120 75% 52%)");
    // Wrapping, so a hue of 340 does not ask for 390.
    expect(cardEdge(340)).toContain("hsl(30 70% 38%)");
  });

  it("and a hue that is not one falls back rather than drawing NaN", () => {
    for (const junk of [null, undefined, NaN, "pink" as never]) {
      expect(cardEdge(junk), String(junk)).toContain("hsl(200 75% 52%)");
    }
  });

  it("everything on it is read at view time, never from the layer", () => {
    expect(viewer).toContain('.select("id, username, display_name, avatar_url, avatar_hue, member_no, created_at")');
    expect(viewer).toContain('layer.type === "hypecard"');
    // The plate, the well and the painted edge come from the profile card, so
    // restyling the card reaches the Shows too.
    expect(card).toContain('from "@/components/profile/CardPlate"');
    expect(card).toContain("<CardPlate edge={cardEdge(card?.hue)}>");
  });

  it("it is not HypefyIdFace shrunk", () => {
    // That face draws a QR canvas at up to 380px times the device ratio, five
    // rows of remarks, and two buttons — on a frame already running a story
    // clock, a video and a song, at a scale where none of it can be read.
    // The import, not the name: the comment above saying this is not that
    // face contains it too.
    expect(card).not.toContain("import { HypefyIdFace");
    expect(card).not.toContain("hypefy-qr");
    expect(card).not.toContain("<canvas");
  });

  it("a tap opens the owner's card, and only when there is one to open", () => {
    expect(view).toContain('"hypecard",');
    expect(card).toContain("if (editing || !handle) return body;");
    expect(card).toContain("href={cardUrl(handle)}");
  });

  it("and the editor places yours, nobody else's", () => {
    expect(editor).toContain('if (me) add("hypecard", { ownerId: me });');
    // An owner-less card is dropped by readLayers, so it would vanish on
    // publish: the tile dims until the editor knows who you are.
    expect(editor).toContain("blocked={me ? undefined : HYPECARD_ONLY}");
  });
});

describe("the Hype meter is the slider, plus the Show's hype", () => {
  const slider = (payload: SliderPayload): ShowLayer =>
    layer({ type: "slider", payload });

  it("the flag rides on the slider's payload, not on a type of its own", () => {
    const [l] = readLayers([slider({ prompt: "How hyped?", hype: true })]);
    expect(l.type).toBe("slider");
    expect(isHypeMeter(l)).toBe(true);
  });

  it("a plain slider is not a meter, and neither is one that says it is false", () => {
    for (const p of [{ prompt: "x" }, { prompt: "x", hype: false }, { prompt: "x", hype: "yes" }]) {
      const [l] = readLayers([slider(p as SliderPayload)]);
      expect(isHypeMeter(l), JSON.stringify(p)).toBe(false);
      // Only ever stored as true: `hype: false` would be a second spelling of
      // the plain slider in the column, for every slider ever placed.
      expect(l.payload).toEqual({ prompt: "x" });
    }
  });

  it("nothing else can be a meter, whatever its payload says", () => {
    // Built by hand rather than through readLayers, which strips a question's
    // `hype` before this ever sees it — so only the guard itself is on trial.
    for (const type of LAYER_TYPES) {
      const l = layer({ type, payload: { prompt: "x", hype: true } as never });
      expect(isHypeMeter(l), type).toBe(type === "slider");
    }
  });

  it("it hypes the Show after the value is saved, not before", () => {
    // A meter that hyped the Show and then failed to record the number would
    // leave the two disagreeing, and the number is what was asked for.
    const send = stickers.slice(stickers.indexOf("async function send("));
    const saved = send.indexOf("put(v, { avg:");
    const hypes = send.indexOf("if (meter && !hyped && v >= HYPE_METER_AT) onHype?.();");
    expect(saved).toBeGreaterThan(0);
    expect(hypes).toBeGreaterThan(saved);
  });

  it("it hypes, and never un-hypes", () => {
    // A drag is a reading, not a switch: pulling the ★ down means you are
    // less excited than you were, not that you take back liking the Show.
    expect(stickers).not.toContain("onUnhype");
    expect(stickers.match(/onHype\?\.\(\)/g) ?? []).toHaveLength(1);
    expect(stickers).toContain("!hyped && v >= HYPE_METER_AT");
  });

  it("the mark is above the middle, where the ★ starts", () => {
    // 50 is where an untouched ★ sits, so a drag ending a point above where it
    // began must not count as saying yes.
    expect(HYPE_METER_AT).toBeGreaterThan(50);
  });

  it("the fill says so before you let go", () => {
    expect(stickers).toContain("background: meter && value >= HYPE_METER_AT ? HYPE_LIME : look.ink,");
  });

  it("and it works the Show's own hype rather than keeping one", () => {
    expect(viewer).toContain("hyped={hyped}");
    expect(viewer).toContain("onHype={toggleShowHype}");
    expect(stickers).not.toContain('p_target_type: "show"');
  });

  it("the editor places a slider for it, written on like any other card", () => {
    expect(editor).toContain('const id = add("slider", { ...blankCard("slider"), hype: true });');
  });
});

describe("both reach the tray", () => {
  it("each has a tile, and each tile is a sticker a Show would keep", () => {
    const keys = ALL_TILES.map((t) => t.key);
    expect(keys).toContain("hypecard");
    expect(keys).toContain("hypemeter");
    for (const t of ALL_TILES) expect(readLayers([t.layer]), t.label).toHaveLength(1);
  });

  it("and the meter's tile is a meter, not a slider wearing its name", () => {
    const tile = ALL_TILES.find((t) => t.key === "hypemeter")!;
    expect(isHypeMeter(tile.layer)).toBe(true);
  });
});
