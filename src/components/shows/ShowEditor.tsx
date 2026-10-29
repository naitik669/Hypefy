"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Type, Smile, Undo2, Trash2, X } from "lucide-react";
import { LayerBody, LayerView } from "@/components/shows/LayerView";
import { TransformBox } from "@/components/shows/TransformBox";
import { lookName } from "@/lib/show-looks";
import {
  DESIGN_WIDTH,
  MAX_LAYERS,
  MAX_LAYER_TEXT,
  layerBox,
  nextLook,
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
 * Phase 2 adds the two layers you make rather than pick: words and a
 * sticker. A song, a poll, a mention, a link and a post embed all need a
 * picker of their own and arrive in Phase 3; the model, the renderer and
 * this screen already carry them.
 */

/** A new layer lands here, and slightly off square so it reads as placed. */
const DROP = { x: 0.5, y: 0.45, scale: 1, rotation: -3 };

const STICKERS = ["🔥", "✨", "💀", "🫠", "❤️", "🎧", "🌙", "⚡"];

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
  const [stickers, setStickers] = useState(false);
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

  const remember = useCallback(() => setPrevious(layers), [layers]);

  const add = useCallback(
    (type: LayerType, payload: ShowLayer["payload"]) => {
      if (layers.length >= MAX_LAYERS) return;
      remember();
      const layer = { id: freshId(), type, ...DROP, look: 0, payload } as ShowLayer;
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

  function writeText(id: string | null, value: string) {
    const text = value.slice(0, MAX_LAYER_TEXT);
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
        l.map((layer) => (layer.id === id ? { ...layer, payload: { text } } : layer)),
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
            <LayerView key={layer.id} layer={layer} frame={frame} editing />
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
            <LayerBody layer={chosen} editing />
          </TransformBox>
        )}

        {/* The rail. */}
        <div className="absolute right-3 top-3 z-20 flex flex-col gap-2">
          <RailButton
            label="Add text"
            disabled={full}
            onClick={() => {
              const id = add("text", { text: "" });
              if (id) setWriting(id);
            }}
          >
            <Type size={18} />
          </RailButton>
          <RailButton label="Add a sticker" disabled={full} onClick={() => setStickers((s) => !s)}>
            <Smile size={18} />
          </RailButton>
          <RailButton label="Undo" disabled={!previous} onClick={() => {
            if (!previous) return;
            setLayers(previous);
            setPrevious(null);
            setSelected(null);
          }}>
            <Undo2 size={18} />
          </RailButton>
        </div>

        <button
          type="button"
          aria-label="Close"
          onClick={onCancel}
          className="absolute left-3 top-3 z-20 flex h-10 w-10 items-center justify-center rounded-[30%] bg-black/50 text-white backdrop-blur-sm"
        >
          <X size={19} />
        </button>

        {chosen && (
          <div className="pointer-events-none absolute inset-x-0 bottom-28 z-20 flex justify-center">
            <span className="rounded-pill bg-black/65 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-white backdrop-blur-sm">
              {lookName(chosen.type, chosen.look)} · tap again to change
            </span>
          </div>
        )}

        {stickers && (
          <div className="absolute inset-x-3 bottom-28 z-30 flex flex-wrap justify-center gap-2 rounded-2xl border border-border bg-elevated/95 p-3 backdrop-blur-xl">
            {STICKERS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={`Add ${emoji}`}
                className="flex h-12 w-12 items-center justify-center rounded-[30%] text-2xl transition active:scale-90"
                onClick={() => {
                  add("sticker", { emoji });
                  setStickers(false);
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
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
            defaultValue={(chosen?.payload as { text?: string } | undefined)?.text ?? ""}
            onChange={(e) => writeText(writing, e.target.value)}
            onBlur={(e) => {
              writeText(writing, e.target.value);
              setWriting(null);
            }}
            placeholder="Say something"
            className="h-12 w-full rounded-xl bg-surface px-4 text-sm text-foreground outline-none placeholder:text-muted"
          />
        </div>
      )}

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
      className="flex h-10 w-10 items-center justify-center rounded-[30%] bg-black/50 text-white backdrop-blur-sm transition active:scale-90 disabled:opacity-35"
    >
      {children}
    </button>
  );
}
