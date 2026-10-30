"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Undo2, Trash2, X } from "lucide-react";
import { LayerBody, LayerView } from "@/components/shows/LayerView";
import { TransformBox } from "@/components/shows/TransformBox";
import { TrackPicker } from "@/components/music/TrackPicker";
import { StickerTray, type SheetKey, type WidgetKey } from "@/components/shows/StickerTray";
import { PollComposer } from "@/components/messages/PollComposer";
import {
  EmbedSheet,
  LinkSheet,
  MentionSheet,
  QuestionSheet,
  type EmbedState,
} from "@/components/shows/ShowWidgetPickers";
import { COLOUR_SWATCHES, lookName, usesColours } from "@/lib/show-looks";
import { ambientTint, photoAverage } from "@/lib/ambient";
import {
  DESIGN_WIDTH,
  MAX_LAYERS,
  MAX_LAYER_TEXT,
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
import { topmostAt, type Placed } from "@/lib/transform-gesture";

/**
 * Arranging a Show.
 *
 * The editor is the Show: the frame you arrange is the frame people get.
 * Diary's composer states the principle — "the editor IS the page… What
 * you see here is the card your circle gets" — and it holds harder here,
 * because every layer is drawn by the same component the viewer uses.
 *
 * Everything a layer can be is reachable from one tray. Three of the
 * pickers behind it are the app's own, reused rather than rebuilt — a
 * song comes from TrackPicker, a poll from PollComposer, and a mention
 * from the same people search the chat composer's typeahead uses — and
 * three are in ShowWidgetPickers because they had nowhere to come from.
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
  const [tray, setTray] = useState(false);
  /** Which picker is open, if any. */
  const [picking, setPicking] = useState<Picker>(null);
  /** The pictures for embedded layers, as the viewer would supply them. */
  const [embeds, setEmbeds] = useState<Record<string, EmbedState>>({});
  /** One step back, which is the one people actually reach for. */
  const [previous, setPrevious] = useState<ShowLayer[] | null>(null);

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

  const removeChosen = useCallback(() => {
    if (!selected) return;
    remember();
    setLayers((l) => l.filter((layer) => layer.id !== selected));
    setSelected(null);
  }, [selected, remember]);

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
   * A tap on the picture selects what is under it, and a tap on what is
   * already selected runs it through its looks — the gesture people know
   * from every sticker they have used.
   */
  function onFrameDown(e: React.PointerEvent) {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const k = frame.width / rect.width;
    const at = { x: (e.clientX - rect.left) * k, y: (e.clientY - rect.top) * k };

    const boxes = layers.map((layer) => {
      const box = layerBox(layer, frame);
      // A generous square about the centre: the real shapes differ and a
      // thumb does not, and topmostAt says why axis-aligned is right.
      const side = 110 * layer.scale;
      return { id: layer.id, left: box.left - side / 2, top: box.top - side / 2, width: side, height: side };
    });

    const hit = topmostAt(at, boxes);
    if (!hit) {
      setSelected(null);
      return;
    }
    if (hit === selected) {
      // Chips and cards pick a colour from the row below instead.
      const layer = layers.find((x) => x.id === hit);
      if (layer && usesColours(layer.type)) return;
      remember();
      setLayers((l) =>
        l.map((layer) =>
          layer.id === hit ? { ...layer, look: nextLook(layer.type, layer.look) } : layer,
        ),
      );
      return;
    }
    setSelected(hit);
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
      <div ref={frameRef} className="relative flex-1 overflow-hidden" onPointerDown={onFrameDown}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />

        {/* Drawn by the same component the viewer uses, so what is
            arranged here is what people get. */}
        {layers.map((layer) =>
          layer.id === selected ? null : (
            <LayerView key={layer.id} layer={layer} frame={frame} editing embeds={embeds} />
          ),
        )}

        {chosen && (
          <TransformBox
            placed={chosen}
            frame={frame}
            onChange={(next) => update(chosen.id, next)}
            onCommit={remember}
          >
            {/* The body alone: the box above already owns where it
                sits, how big it is and which way it faces. */}
            <LayerBody layer={chosen} editing embeds={embeds} />
          </TransformBox>
        )}

        {/* The rail. */}
        {/* No plates: bold white with a soft shadow reads on any photo
            and leaves the picture alone. */}
        <div className="absolute right-2 top-2 z-20 flex flex-col gap-1.5">
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
          onClick={onCancel}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute left-2 top-2 z-20 flex h-12 w-12 items-center justify-center text-white [filter:drop-shadow(0_1px_1.5px_rgba(0,0,0,0.6))_drop-shadow(0_0_8px_rgba(0,0,0,0.3))] transition active:scale-90"
        >
          <X size={26} strokeWidth={2.6} />
        </button>

        {chosen && usesColours(chosen.type) ? (
          // The eight colours, as a row under the picture.
          <div
            role="radiogroup"
            aria-label="Sticker colour"
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute inset-x-0 bottom-4 z-20 flex justify-center gap-2.5"
            data-colour-row
          >
            {COLOUR_SWATCHES.map((sw, i) => {
              const on = chosen.look === i;
              return (
                <button
                  key={sw.name}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={sw.name}
                  title={sw.name}
                  onClick={() => paint(i)}
                  style={{ background: i === AMBIENT_LOOK && ambient ? ambient : sw.background }}
                  className={`rounded-[11px] shadow-[0_2px_8px_rgba(0,0,0,0.35)] transition active:scale-90 ${
                    on ? "h-9 w-9 border-[3px] border-accent" : "h-8 w-8 border-2 border-white/80"
                  } ${sw.name === "Glass" ? "backdrop-blur-md" : ""}`}
                />
              );
            })}
          </div>
        ) : chosen ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center">
            <span className="rounded-pill bg-black/65 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-white backdrop-blur-sm">
              {lookName(chosen.type, chosen.look)} · tap again to change
            </span>
          </div>
        ) : null}

        {tray && (
          <StickerTray
            onClose={() => setTray(false)}
            onSticker={(emoji) => {
              add("sticker", { emoji });
              setTray(false);
            }}
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
      <PollComposer
        open={picking === "poll"}
        onClose={() => setPicking(null)}
        onSend={(question, options) => {
          // A Show poll takes one answer each, so the composer's
          // multiple-choice switch has nothing to set here.
          add("poll", { question, options });
          setPicking(null);
        }}
      />
      <QuestionSheet
        open={picking === "question"}
        onClose={() => setPicking(null)}
        onPick={(prompt) => add("question", { prompt })}
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

      {writing === null && (
        <div className="flex items-center gap-2 border-t border-border bg-black p-3 pb-[max(var(--sab),12px)]">
          <button
            type="button"
            disabled={!selected}
            onClick={removeChosen}
            aria-label="Remove this layer"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-elevated text-muted disabled:opacity-40"
          >
            <Trash2 size={18} />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onPublish(readLayers(layers))}
            className="h-12 flex-1 rounded-xl bg-accent text-sm font-extrabold text-accent-ink transition active:scale-[0.99] disabled:opacity-60"
          >
            {busy ? "Posting…" : "Add to your Show"}
          </button>
        </div>
      )}
    </div>
  );
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
