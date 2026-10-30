"use client";

import { useState } from "react";
import { LayerBody } from "@/components/shows/LayerView";
import type { EmbedState } from "@/components/shows/ShowWidgetPickers";
import type { LayerType, ShowLayer } from "@/lib/show-layers";

/** The widgets, each opening its own picker. Kept in the order people reach for them. */
export type WidgetKey = "music" | "mention" | "link" | "poll" | "question" | "embed";

/**
 * Emoji in four moods.
 *
 * Only ones from Emoji 12 and earlier: a newer one (🫠 was here) draws as an
 * empty box on a phone or browser that has not caught up, and a sticker that
 * is a box is worse than no sticker.
 */
export const EMOJI_GROUPS: { id: string; label: string; emoji: string[] }[] = [
  { id: "hype", label: "Hype", emoji: ["🔥", "✨", "⚡", "💯", "🎉", "🙌", "👏", "🚀", "⭐", "💥", "🏆", "👑"] },
  { id: "feels", label: "Feels", emoji: ["😂", "😭", "😍", "🥺", "😎", "🤯", "💀", "😴", "🙄", "😤", "🤔", "🙃"] },
  { id: "love", label: "Love", emoji: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💕", "💖", "💘", "😘"] },
  { id: "vibes", label: "Vibes", emoji: ["🌙", "☀️", "🌈", "🌊", "🌸", "🍃", "🎧", "🎶", "📸", "🎮", "☕", "🍕"] },
];

/**
 * What each widget tile shows: the widget itself, drawn small by the same
 * component that draws it on the Show. The tray used to be six lime icons
 * on grey squares, which said what the buttons were called but not what
 * would land on the picture.
 */
const SAMPLE_EMBED_ID = "tray-sample-post";

function sample(type: LayerType, payload: ShowLayer["payload"], id = `tray-${type}`): ShowLayer {
  return { id, type, x: 0.5, y: 0.5, scale: 1, rotation: 0, look: 0, payload } as ShowLayer;
}

const WIDGET_TILES: { key: WidgetKey; label: string; layer: ShowLayer; zoom: number }[] = [
  {
    key: "music",
    label: "Music",
    layer: sample("music", { id: "tray", title: "Your song", artist: "Any artist", artwork: null, preview: null }),
    zoom: 0.5,
  },
  { key: "mention", label: "Mention", layer: sample("mention", { username: "someone" }), zoom: 0.55 },
  { key: "link", label: "Link", layer: sample("link", { url: "https://hypefy.chat" }), zoom: 0.55 },
  {
    key: "poll",
    label: "Poll",
    layer: sample("poll", { question: "Which one?", options: ["This", "That"] }),
    zoom: 0.34,
  },
  { key: "question", label: "Question", layer: sample("question", { prompt: "Ask me anything" }), zoom: 0.36 },
  { key: "embed", label: "Your post", layer: sample("post", { postId: "tray" }, SAMPLE_EMBED_ID), zoom: 0.3 },
];

const SAMPLE_EMBEDS: Record<string, EmbedState> = {
  [SAMPLE_EMBED_ID]: { thumb: null, caption: "Something you posted" },
};

/**
 * Everything a layer can be, in one sheet over the photo.
 *
 * Glass rather than a black slab, so the picture you are decorating stays
 * in view behind it; widgets shown as themselves; emoji by mood rather
 * than eight in a row.
 */
export function StickerTray({
  onSticker,
  onWidget,
  onClose,
}: {
  onSticker: (emoji: string) => void;
  onWidget: (key: WidgetKey) => void;
  onClose: () => void;
}) {
  const [group, setGroup] = useState(EMOJI_GROUPS[0].id);
  const emoji = EMOJI_GROUPS.find((g) => g.id === group) ?? EMOJI_GROUPS[0];

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end" data-sticker-tray>
      {/* Tapping the picture puts the tray away. */}
      <button
        type="button"
        aria-label="Close stickers"
        onClick={onClose}
        onPointerDown={(e) => e.stopPropagation()}
        className="flex-1 bg-gradient-to-b from-transparent to-black/50"
      />

      <div
        role="dialog"
        aria-label="Add to your Show"
        onPointerDown={(e) => e.stopPropagation()}
        className="animate-rise max-h-[66%] overflow-y-auto rounded-t-[28px] border-t border-white/10 bg-black/45 px-4 pb-5 pt-2 text-white shadow-[0_-12px_40px_rgba(0,0,0,0.35)] backdrop-blur-2xl backdrop-saturate-150"
      >
        <span aria-hidden className="mx-auto mb-3 block h-1 w-10 rounded-full bg-white/30" />

        <h2 className="px-1 pb-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white/60">Stickers</h2>
        <div className="grid grid-cols-3 gap-2">
          {WIDGET_TILES.map(({ key, label, layer, zoom }) => (
            <button
              key={key}
              type="button"
              onClick={() => onWidget(key)}
              aria-label={`Add ${label.toLowerCase()}`}
              className="group flex flex-col items-center gap-1.5 rounded-2xl bg-white/[0.07] px-1 pb-2 pt-1.5 transition hover:bg-white/[0.12] active:scale-95"
            >
              {/* The widget itself, small. Drawn at its real size and shrunk,
                  so the preview cannot drift from what gets placed. */}
              <span aria-hidden className="pointer-events-none flex h-[60px] w-full items-center justify-center overflow-hidden">
                <span style={{ transform: `scale(${zoom})` }} className="inline-block shrink-0 origin-center">
                  <LayerBody layer={layer} editing embeds={SAMPLE_EMBEDS} />
                </span>
              </span>
              <span className="text-[12px] font-semibold text-white/85">{label}</span>
            </button>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between px-1 pb-2">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/60">Emoji</h2>
          <div role="tablist" aria-label="Emoji moods" className="flex gap-1">
            {EMOJI_GROUPS.map((g) => {
              const on = g.id === group;
              return (
                <button
                  key={g.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setGroup(g.id)}
                  className={`h-7 rounded-pill px-2.5 text-[12px] font-semibold transition ${
                    on ? "bg-white text-black" : "text-white/70 hover:text-white"
                  }`}
                >
                  {g.label}
                </button>
              );
            })}
          </div>
        </div>
        <div role="tabpanel" aria-label={emoji.label} className="grid grid-cols-6 gap-1">
          {emoji.emoji.map((e) => (
            <button
              key={e}
              type="button"
              aria-label={`Add ${e}`}
              onClick={() => onSticker(e)}
              className="flex aspect-square items-center justify-center rounded-2xl text-[30px] leading-none transition hover:bg-white/10 active:scale-90"
            >
              {e}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
