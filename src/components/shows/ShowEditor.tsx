"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Music, Trash2, Undo2, X } from "lucide-react";
import { LayerView } from "@/components/shows/LayerView";
import { TrackPicker } from "@/components/music/TrackPicker";
import { StickerTray, type SheetKey, type WidgetKey } from "@/components/shows/StickerTray";
import {
  CardEditor,
  blankCard,
  cardIsBlank,
  isCard,
  isCardType,
  tidyCard,
} from "@/components/shows/CardEditor";
import {
  EmbedSheet,
  LinkSheet,
  MentionSheet,
  type EmbedState,
} from "@/components/shows/ShowWidgetPickers";
import { COLOUR_SWATCHES, lookFor, lookName, usesColours } from "@/lib/show-looks";
import { haptics } from "@/lib/haptics";
import { ambientTint, photoAverage } from "@/lib/ambient";
import {
  DESIGN_WIDTH,
  MAX_LAYERS,
  MAX_LAYER_TEXT,
  LOOKS,
  layerBox,
  nextLook,
  AMBIENT_LOOK,
  isTyped,
  typedPayload,
  typedValue,
  readLayers,
  type LayerType,
  type ShowLayer,
} from "@/lib/show-layers";
import { dragged, pinched, topmostAt, type Placed, type Point } from "@/lib/transform-gesture";

/**
 * Arranging a Show.
 *
 * The editor is the Show: the frame you arrange is the frame people get.
 * Diary's composer states the principle — "the editor IS the page… What
 * you see here is the card your circle gets" — and it holds harder here,
 * because every layer is drawn by the same component the viewer uses.
 *
 * Everything a layer can be is reachable from one tray. A poll or a
 * question is written on the sticker itself (CardEditor); words, a place
 * and a tag are typed at the foot; the time is stamped. The rest come from
 * pickers: a song from the app's own TrackPicker, a mention from the same
 * people search the chat composer's typeahead uses, and a link or an
 * embed from ShowWidgetPickers.
 *
 * An embed is picked here but not *stored* here: the layer keeps only
 * the post's id, and its picture is handed to the renderer separately,
 * the same way the viewer fetches it. A thumbnail copied into the layer
 * would outlive a takedown of the thing it came from.
 */

/** A new layer lands here, and slightly off square so it reads as placed. */
const DROP = { x: 0.5, y: 0.45, scale: 1, rotation: -3 };

/**
 * Where the nth layer lands.
 *
 * Every one used to arrive on the same spot, which was survivable while
 * the only things to add were words and a sticker and plainly wrong once
 * a Show can carry eight: the second widget covered the first exactly,
 * so it read as nothing having happened. Each lands a little below and
 * to the right of the last, the way a duplicated object does in every
 * drawing program, and wraps before it walks off the bottom.
 */
function dropAt(count: number) {
  const step = count % 6;
  return { ...DROP, x: DROP.x + step * 0.035, y: DROP.y + step * 0.055 };
}

/** How long a still finger counts as holding, in ms. */
const HOLD_MS = 420;
/** How far a finger may wander, in frame px, and still be a tap or a hold. */
const SLOP = 8;

/**
 * One finger (or two) on the picture: what it took hold of, where that
 * was when it did, and what the gesture has turned into so far.
 */
type Grip = {
  id: string;
  /** Where the layer was when this stage of the gesture began. */
  from: Placed;
  /** Where it is now, so a second finger pinches from here. */
  now: Placed;
  start: Point;
  moved: boolean;
  pinch: boolean;
  held: boolean;
  /** It began on bare picture, for the selected layer: a pinch, or a tap that lets go. */
  empty: boolean;
  wasSelected: boolean;
  timer: ReturnType<typeof setTimeout> | null;
};

/** Which sheet is open: one per widget the tray offers, so the two cannot drift apart. */
type Picker = SheetKey | null;

function freshId(): string {
  // Collides with nothing and needs no library; the id only has to be
  // unique inside one Show's list.
  return `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function ShowEditor({
  photoUrl,
  busy = false,
  onCancel,
  onPublish,
}: {
  /** The picture being decorated. */
  photoUrl: string;
  busy?: boolean;
  onCancel: () => void;
  onPublish: (layers: ShowLayer[]) => void;
}) {
  const [layers, setLayers] = useState<ShowLayer[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [writing, setWriting] = useState<string | null>(null);
  /** The poll or question being written on, if any. */
  const [editingCard, setEditingCard] = useState<string | null>(null);
  const [tray, setTray] = useState(false);
  /** Which picker is open, if any. */
  const [picking, setPicking] = useState<Picker>(null);
  /** The pictures for embedded layers, as the viewer would supply them. */
  const [embeds, setEmbeds] = useState<Record<string, EmbedState>>({});
  /** One step back, which is the one people actually reach for. */
  const [previous, setPrevious] = useState<ShowLayer[] | null>(null);
  /** The layer being dragged, and whether it is over the bin. */
  const [drag, setDrag] = useState<{ id: string; hot: boolean } | null>(null);
  /** The layer whose colours are popped up beside it, after a hold. */
  const [holding, setHolding] = useState<string | null>(null);
  /** Live fingers on the picture, and what they are holding. */
  const touches = useRef(new Map<number, Point>());
  const startPoints = useRef(new Map<number, Point>());
  const grip = useRef<Grip | null>(null);

  const frameRef = useRef<HTMLDivElement | null>(null);
  const [frame, setFrame] = useState({ width: DESIGN_WIDTH, height: 844 });

  useEffect(() => {
    const el = frameRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const seen = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setFrame({ width, height });
    });
    seen.observe(el);
    return () => seen.disconnect();
  }, []);

  const chosen = useMemo(() => layers.find((l) => l.id === selected) ?? null, [layers, selected]);

  /** The photo's own colour, deepened, for the Ambient look. Read once. */
  const [ambient, setAmbient] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void photoAverage(photoUrl).then((avg) => {
      if (live && avg) setAmbient(ambientTint(avg));
    });
    return () => {
      live = false;
    };
  }, [photoUrl]);

  const remember = useCallback(() => setPrevious(layers), [layers]);

  const add = useCallback(
    (type: LayerType, payload: ShowLayer["payload"]) => {
      if (layers.length >= MAX_LAYERS) return;
      remember();
      const layer = { id: freshId(), type, ...dropAt(layers.length), look: 0, payload } as ShowLayer;
      // Appended, so a new layer lands on top — the list is back to front.
      setLayers((l) => [...l, layer]);
      setSelected(layer.id);
      return layer.id;
    },
    [layers.length, remember],
  );

  const update = useCallback((id: string, next: Placed) => {
    setLayers((l) => l.map((layer) => (layer.id === id ? { ...layer, ...next } : layer)));
  }, []);


  /**
   * What a tray tile does: a picker for the ones that need choosing, and
   * straight onto the picture for the rest — a place or a tag typed at the
   * foot like words are, the time stamped as it is now.
   */
  function place(key: WidgetKey) {
    if (key === "location") {
      const id = add("location", { place: "" });
      if (id) setWriting(id);
    } else if (key === "hashtag") {
      const id = add("hashtag", { tag: "" });
      if (id) setWriting(id);
    } else if (key === "time") {
      add("time", { at: new Date().toISOString() });
    } else if (isCardType(key)) {
      // Placed blank and written on the sticker itself.
      const id = add(key, blankCard(key));
      if (id) setEditingCard(id);
    } else {
      setPicking(key);
    }
  }

  /** Dress the chosen layer in one of the eight colours. */
  function paint(look: number) {
    if (!chosen) return;
    remember();
    setLayers((l) =>
      l.map((layer) => {
        if (layer.id !== chosen.id) return layer;
        const { tint: _drop, ...rest } = layer;
        void _drop;
        return look === AMBIENT_LOOK && ambient ? { ...rest, look, tint: ambient } : { ...rest, look };
      }),
    );
  }

  /**
   * Everything a finger does on the picture, with no box to aim at.
   *
   * A tap selects what is under it, and a tap on what is already selected
   * opens it to be written on. A drag moves it, and the bin comes up while
   * it does; let go over the bin and it is gone. Two fingers pinch it to
   * size and twist it round, wherever the second one lands. A still finger
   * held down pops its colours up beside it.
   *
   * The selection box this replaced put eight handles on the picture for
   * three things two fingers already say.
   */
  function onFrameDown(e: React.PointerEvent) {
    const live = touches.current;
    const began = startPoints.current;
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const k = frame.width / rect.width;
    const pointIn = (ev: { clientX: number; clientY: number }): Point => ({
      x: (ev.clientX - rect.left) * k,
      y: (ev.clientY - rect.top) * k,
    });
    const at = pointIn(e);
    live.set(e.pointerId, at);
    began.set(e.pointerId, at);

    // A second finger joins the gesture already under way and makes it a
    // pinch, measured from both fingers as they are now.
    const going = grip.current;
    if (going) {
      if (going.timer) clearTimeout(going.timer);
      going.pinch = true;
      going.from = going.now;
      for (const [id, point] of live) began.set(id, point);
      if (!going.moved && !going.empty) remember();
      going.moved = true;
      setHolding(null);
      return;
    }

    const boxes = layers.map((layer) => {
      const box = layerBox(layer, frame);
      // A generous square about the centre: the real shapes differ and a
      // thumb does not, and topmostAt says why axis-aligned is right.
      const side = 110 * layer.scale;
      return { id: layer.id, left: box.left - side / 2, top: box.top - side / 2, width: side, height: side };
    });
    const hit = topmostAt(at, boxes);
    setHolding(null);

    if (!hit) {
      if (!selected) {
        live.delete(e.pointerId);
        began.delete(e.pointerId);
        return;
      }
    }
    const id = hit ?? selected!;
    const layer = layers.find((l) => l.id === id)!;
    const placed: Placed = { x: layer.x, y: layer.y, scale: layer.scale, rotation: layer.rotation };
    const g: Grip = {
      id,
      from: placed,
      now: placed,
      start: at,
      moved: false,
      pinch: false,
      held: false,
      empty: !hit,
      wasSelected: id === selected,
      timer: null,
    };
    grip.current = g;
    if (hit) {
      g.timer = setTimeout(() => {
        if (g.moved || g.pinch || live.size !== 1) return;
        g.held = true;
        setSelected(id);
        setHolding(id);
        haptics.select();
      }, HOLD_MS);
    }

    const overBin = (ev: PointerEvent) =>
      ev.clientY > rect.bottom - 150 && Math.abs(ev.clientX - (rect.left + rect.width / 2)) < 90;

    const move = (ev: PointerEvent) => {
      if (!live.has(ev.pointerId)) return;
      const now = pointIn(ev);
      live.set(ev.pointerId, now);

      if (g.pinch && live.size >= 2) {
        const ids = [...live.keys()].slice(0, 2);
        const a = live.get(ids[0])!;
        const b = live.get(ids[1])!;
        const next = pinched(g.from, began.get(ids[0]) ?? a, began.get(ids[1]) ?? b, a, b);
        g.now = next;
        update(g.id, next);
        return;
      }
      if (g.held || g.empty) return;
      if (!g.moved) {
        if (Math.hypot(now.x - g.start.x, now.y - g.start.y) < SLOP) return;
        g.moved = true;
        if (g.timer) clearTimeout(g.timer);
        remember();
        setSelected(g.id);
      }
      const next = dragged(g.from, g.start, now, frame);
      g.now = next;
      update(g.id, next);
      const hot = overBin(ev);
      setDrag((d) => (d && d.id === g.id && d.hot === hot ? d : { id: g.id, hot }));
    };

    const end = (ev: PointerEvent) => {
      live.delete(ev.pointerId);
      began.delete(ev.pointerId);
      if (live.size > 0) {
        // One finger of a pinch lifted: the other carries on as a drag
        // from where things now are.
        const [rest] = [...live.values()];
        g.pinch = false;
        g.empty = false;
        g.from = g.now;
        g.start = rest;
        return;
      }
      if (g.timer) clearTimeout(g.timer);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      grip.current = null;

      const binned = g.moved && !g.pinch && overBin(ev);
      setDrag(null);
      if (binned) {
        setLayers((l) => l.filter((layer) => layer.id !== g.id));
        setSelected(null);
        haptics.tap();
        return;
      }
      if (g.moved || g.pinch || g.held) return;
      if (g.empty) {
        setSelected(null);
        return;
      }
      if (g.wasSelected) {
        // A poll or a question opens to be written on again, and words,
        // a place or a tag open their field.
        const chosenLayer = layers.find((x) => x.id === g.id) ?? null;
        if (isCard(chosenLayer)) {
          setEditingCard(g.id);
          return;
        }
        if (chosenLayer && (chosenLayer.type === "text" || isTyped(chosenLayer.type))) setWriting(g.id);
        return;
      }
      setSelected(g.id);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  /** The colour wheel: one tap, the next colour. */
  function nextColour() {
    if (!chosen) return;
    paint(nextLook(chosen.type, chosen.look));
    haptics.tap();
  }

  /** `done` is the field being left: only then does an empty layer go. */
  function writeText(id: string | null, value: string, done = false) {
    const layer = layers.find((l) => l.id === id);
    const type = layer && isTyped(layer.type) ? layer.type : "text";
    const payload = typedPayload(type, value);
    const text = typedValue({ ...(layer ?? { type: "text" }), payload } as ShowLayer);
    // Mid-typing an empty value is just a start: "#" on its way to a tag
    // cleans to nothing, and removing the layer there lost it.
    if (!text.trim() && !done) return;
    if (!text.trim()) {
      // An empty text layer is nothing to look at; cancelling out of the
      // field removes it rather than leaving an invisible thing to find.
      if (id) setLayers((l) => l.filter((layer) => layer.id !== id));
      setWriting(null);
      setSelected(null);
      return;
    }
    if (id) {
      setLayers((l) =>
        l.map((layer) => (layer.id === id ? { ...layer, payload } : layer)),
      );
    }
  }

  const full = layers.length >= MAX_LAYERS;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black">
      <div
        ref={frameRef}
        className="relative flex-1 overflow-hidden"
        onPointerDown={onFrameDown}
        // The browser's own gestures would take the finger first: a drag
        // of the photo is an image drag, a slide is a scroll, and either
        // one cancels the pointer mid-move.
        onDragStart={(e) => e.preventDefault()}
        style={{ touchAction: "none" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoUrl} alt="" draggable={false} className="absolute inset-0 h-full w-full select-none object-cover" />

        {/* The bin, while something is being dragged. Drawn before the
            layers, so the sticker passes over it on its way in. */}
        {drag && (
          <div className="pointer-events-none absolute inset-x-0 bottom-10 z-0 flex flex-col items-center gap-2" data-bin>
            <span
              className={`flex items-center justify-center rounded-[24px] border-[3px] border-white text-white shadow-[0_10px_26px_rgba(0,0,0,0.4)] transition-all duration-150 ${
                drag.hot ? "h-[76px] w-[76px] bg-danger" : "h-16 w-16 bg-black/45 backdrop-blur-sm"
              }`}
            >
              <Trash2 size={drag.hot ? 30 : 26} strokeWidth={2.4} />
            </span>
            <span className="text-[13px] font-extrabold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
              {drag.hot ? "Let go to delete" : "Drag here to delete"}
            </span>
          </div>
        )}

        {/* Drawn by the same component the viewer uses, so what is
            arranged here is what people get — and with no box round the
            one being moved, it looks exactly as it will. */}
        {layers.map((layer) => (
          <div
            key={layer.id}
            className="absolute inset-0 transition-opacity"
            style={drag?.id === layer.id && drag.hot ? { opacity: 0.55 } : undefined}
          >
            <LayerView layer={layer} frame={frame} editing embeds={embeds} />
          </div>
        ))}

        {/* The rail. */}
        {/* No plates: bold white with a soft shadow reads on any photo
            and leaves the picture alone. */}
        {/* Put away while a card is being written on: its own Done sits there. */}
        <div className={`absolute right-2 top-2 z-20 flex flex-col gap-1.5 ${editingCard || selected || drag ? "hidden" : ""}`}>
          <RailButton
            label="Add text"
            disabled={full}
            onClick={() => {
              const id = add("text", { text: "" });
              if (id) setWriting(id);
            }}
          >
            <span className="text-[22px] font-extrabold tracking-[-0.06em]">Aa</span>
          </RailButton>
          <RailButton label="Add something" disabled={full} onClick={() => setTray((t) => !t)}>
            <PeelIcon />
          </RailButton>
          <RailButton label="Add music" disabled={full} onClick={() => setPicking("music")}>
            <Music size={26} strokeWidth={2.5} />
          </RailButton>
          <RailButton label="Undo" disabled={!previous} onClick={() => {
            if (!previous) return;
            setLayers(previous);
            setPrevious(null);
            setSelected(null);
          }}>
            <Undo2 size={26} strokeWidth={2.5} />
          </RailButton>
        </div>

        <button
          type="button"
          aria-label="Close"
          data-hidden={!!editingCard || !!drag}
          onClick={onCancel}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute left-2 top-2 z-20 flex h-12 w-12 items-center justify-center text-white data-[hidden=true]:hidden [filter:drop-shadow(0_1px_1.5px_rgba(0,0,0,0.6))_drop-shadow(0_0_8px_rgba(0,0,0,0.3))] transition active:scale-90"
        >
          <X size={26} strokeWidth={2.6} />
        </button>

        {/* While something is selected: its colour wheel up top, and Done
            where the rail was. One tap on the wheel is the next colour. */}
        {chosen && !drag && !editingCard && writing === null && (
          <>
            <button
              type="button"
              onClick={nextColour}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label={`Change colour (now ${lookName(chosen.type, chosen.look)})`}
              className="absolute left-1/2 top-3 z-20 flex h-11 w-11 -translate-x-1/2 items-center justify-center rounded-[15px] border-[3px] border-white shadow-[0_4px_14px_rgba(0,0,0,0.35)] transition active:scale-90"
              style={{ background: "conic-gradient(#ef4444, #f59e0b, #a3e635, #22d3ee, #6366f1, #d946ef, #ef4444)" }}
              data-colour-wheel
            >
              <span
                aria-hidden
                className="block h-[18px] w-[18px] rounded-[7px] border-2 border-white"
                style={{ background: swatchOf(chosen, ambient) }}
              />
            </button>
            <button
              type="button"
              onClick={() => {
                setSelected(null);
                setHolding(null);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute right-3 top-3.5 z-20 h-10 rounded-[14px] bg-accent px-[18px] text-[15px] font-extrabold text-accent-ink transition active:scale-95"
            >
              Done
            </button>
          </>
        )}

        {/* Held: every colour pops up in a column beside it — on its right,
            or on its left when the right edge is too close. */}
        {(() => {
          const held = layers.find((l) => l.id === holding) ?? null;
          if (!held || drag) return null;
          const looks = Array.from({ length: LOOKS[held.type] }, (_, i) => i);
          const box = layerBox(held, frame);
          const reach = 90 * held.scale;
          const height = looks.length * 46;
          const right = box.left + reach + 12 + 46 <= frame.width;
          const left = right ? box.left + reach + 12 : Math.max(8, box.left - reach - 12 - 42);
          const top = Math.min(Math.max(box.top - height / 2, 70), Math.max(70, frame.height - height - 24));
          return (
            <div
              role="radiogroup"
              aria-label="Colour"
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute z-30 flex flex-col gap-2"
              style={{ left, top }}
              data-colour-column
            >
              {looks.map((i) => {
                const on = held.look === i;
                return (
                  <button
                    key={i}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={lookName(held.type, i)}
                    onClick={() => {
                      paint(i);
                      haptics.tap();
                    }}
                    style={{ background: swatchOf({ ...held, look: i }, ambient), animationDelay: `${i * 30}ms` }}
                    className={`animate-pop h-[38px] w-[38px] rounded-[13px] shadow-[0_4px_12px_rgba(0,0,0,0.35)] ${
                      on ? "border-[3px] border-accent" : "border-2 border-white"
                    }`}
                  />
                );
              })}
            </div>
          );
        })()}

        {/* The one way on: small, in the corner, out of the picture's way. */}
        {!selected && !drag && !tray && !editingCard && writing === null && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onPublish(readLayers(layers))}
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute bottom-[max(1.5rem,var(--sab))] right-4 z-20 flex h-12 items-center gap-1.5 rounded-[17px] bg-accent pl-5 pr-4 text-[15px] font-extrabold text-accent-ink shadow-[0_8px_20px_rgba(0,0,0,0.35)] transition active:scale-95 disabled:opacity-60"
          >
            {busy ? "Posting…" : "Next"}
            <ChevronRight size={18} strokeWidth={2.8} />
          </button>
        )}

        {(() => {
          const card = layers.find((l) => l.id === editingCard) ?? null;
          if (!isCard(card)) return null;
          return (
            <CardEditor
              layer={card}
              onChange={(payload) =>
                setLayers((l) => l.map((x) => (x.id === card.id ? { ...x, payload } : x)))
              }
              onDone={() => {
                if (cardIsBlank(card)) {
                  // Opened and left empty: as if it had never been added.
                  setLayers((l) => l.filter((x) => x.id !== card.id));
                  setSelected(null);
                } else {
                  setLayers((l) => l.map((x) => (x.id === card.id ? tidyCard(card) : x)));
                }
                setEditingCard(null);
              }}
            />
          );
        })()}

        {tray && (
          <StickerTray
            onClose={() => setTray(false)}
            onWidget={(key) => {
              setTray(false);
              place(key);
            }}
          />
        )}
      </div>

      {/* Writing happens in a real field at the foot, not on the picture:
          a caret under a thumb on a photograph is unreadable, and the
          keyboard would cover whatever was being typed. */}
      {writing !== null && (
        <div className="absolute inset-x-0 bottom-0 z-40 border-t border-border bg-elevated p-3 pb-[max(var(--sab),12px)]">
          <label htmlFor="layer-text" className="sr-only">
            What it says
          </label>
          <input
            id="layer-text"
            autoFocus
            maxLength={MAX_LAYER_TEXT}
            defaultValue={chosen ? typedValue(chosen) : ""}
            onChange={(e) => writeText(writing, e.target.value)}
            onBlur={(e) => {
              writeText(writing, e.target.value, true);
              setWriting(null);
            }}
            placeholder={
              chosen?.type === "location" ? "Where are you?" : chosen?.type === "hashtag" ? "#hashtag" : "Say something"
            }
            className="h-12 w-full rounded-xl bg-surface px-4 text-sm text-foreground outline-none placeholder:text-muted"
          />
        </div>
      )}

      <TrackPicker
        open={picking === "music"}
        onClose={() => setPicking(null)}
        onSelect={(track) => {
          add("music", {
            id: track.id,
            title: track.title,
            artist: track.artist,
            artwork: track.artwork || null,
            preview: track.preview || null,
            ...(track.uri ? { uri: track.uri } : {}),
            ...(track.start ? { start: track.start } : {}),
          });
          setPicking(null);
        }}
      />
      <MentionSheet
        open={picking === "mention"}
        onClose={() => setPicking(null)}
        onPick={(username) => add("mention", { username })}
      />
      <LinkSheet
        open={picking === "link"}
        onClose={() => setPicking(null)}
        onPick={(url) => add("link", { url })}
      />
      <EmbedSheet
        open={picking === "embed"}
        onClose={() => setPicking(null)}
        onPick={(choice) => {
          const id =
            choice.kind === "post"
              ? add("post", { postId: choice.id })
              : add("shot", { shotId: choice.id });
          // What was just picked is already in hand, so the editor draws
          // it without a second round trip — the layer still stores only
          // the id.
          if (id) {
            setEmbeds((e) => ({
              ...e,
              [id]: { thumb: choice.thumb, caption: choice.caption },
            }));
          }
        }}
      />

    </div>
  );
}

/** What a layer's look looks like, as one swatch. */
function swatchOf(layer: ShowLayer, ambient: string | null): string {
  if (usesColours(layer.type)) {
    const sw = COLOUR_SWATCHES[layer.look] ?? COLOUR_SWATCHES[0];
    return layer.look === AMBIENT_LOOK && ambient ? ambient : sw.background;
  }
  const bg = lookFor(layer.type, layer.look).box.background;
  return typeof bg === "string" && bg !== "transparent" ? bg : "#ffffff";
}

function RailButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      className="flex h-12 w-12 items-center justify-center text-white [filter:drop-shadow(0_1px_1.5px_rgba(0,0,0,0.6))_drop-shadow(0_0_8px_rgba(0,0,0,0.3))] transition active:scale-90 disabled:opacity-45"
    >
      {children}
    </button>
  );
}

/** A square sticker with its corner lifting: the tray's button. */
function PeelIcon() {
  return (
    <svg aria-hidden width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 13.5V8a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v8a4 4 0 0 0 4 4h5.5z" />
      <path d="M13.5 20v-3a3.5 3.5 0 0 1 3.5-3.5h3" />
      <path d="M9.5 10h.01M14.5 10h.01" />
      <path d="M9 14c.9.8 2 1.1 3 .9" />
    </svg>
  );
}
