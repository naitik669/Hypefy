"use client";

import { useState } from "react";
import { LayerBody } from "@/components/shows/LayerView";
import type { EmbedState } from "@/components/shows/ShowWidgetPickers";
import { AMBIENT_LOOK, type LayerType, type ShowLayer } from "@/lib/show-layers";

/** The widgets that open a picker of their own. */
export type SheetKey = "music" | "mention" | "link" | "embed";
/**
 * Those placed straight onto the picture: written on the sticker itself
 * (poll, question, quiz, slider, countdown, Add yours), typed at the foot
 * (location, hashtag), or stamped (time).
 */
export type DirectKey =
  | "poll"
  | "question"
  | "quiz"
  | "slider"
  | "countdown"
  | "addyours"
  | "location"
  | "hashtag"
  | "time";
export type WidgetKey = SheetKey | DirectKey;

/**
 * One sticker in the tray: the thing itself, drawn small by LayerBody —
 * the component that draws it on the Show — at an angle, with its name
 * under it. The colour each wears here is one of the eight, chosen so the
 * tray shows the range; a placed sticker starts in Night like always.
 */
type Tile = { key: WidgetKey; label: string; layer: ShowLayer; zoom: number; tilt: number };

const SAMPLE_EMBED_ID = "tray-sample-post";

function sample(type: LayerType, payload: ShowLayer["payload"], look = 0, id = `tray-${type}`): ShowLayer {
  // Never Ambient here: there is no photo behind the tray to take it from.
  return { id, type, x: 0.5, y: 0.5, scale: 1, rotation: 0, look: look === AMBIENT_LOOK ? 0 : look, payload } as ShowLayer;
}

const SOON = new Date(Date.now() + (2 * 24 + 4) * 3600_000).toISOString();

/** The big ones, pinned and swiped through, in two shelves. */
export const ASK_AND_PLAY: Tile[] = [
  { key: "poll", label: "Poll", layer: sample("poll", { question: "Which one?", options: ["This", "That"] }, 3), zoom: 0.6, tilt: -4 },
  { key: "quiz", label: "Quiz", layer: sample("quiz", { question: "Guess my age?", options: ["19", "22"], answer: 0 }, 0), zoom: 0.6, tilt: 3 },
  { key: "question", label: "Question", layer: sample("question", { prompt: "Ask me anything" }, 7), zoom: 0.6, tilt: -3 },
];

export const HYPE_AND_PLAN: Tile[] = [
  { key: "slider", label: "Hype slider", layer: sample("slider", { prompt: "How hyped are you?" }, 1), zoom: 0.6, tilt: 3 },
  { key: "countdown", label: "Countdown", layer: sample("countdown", { title: "Trip to Goa", at: SOON }, 6), zoom: 0.58, tilt: -4 },
  { key: "addyours", label: "Add yours", layer: sample("addyours", { prompt: "Your desk setup" }, 3), zoom: 0.62, tilt: 4 },
];

export const YOURS: Tile[] = [
  { key: "embed", label: "Post or Shot", layer: sample("post", { postId: "tray" }, 1, SAMPLE_EMBED_ID), zoom: 0.55, tilt: -3 },
];

/** The squircle chips. */
export const TAGS: Tile[] = [
  { key: "music", label: "Music", layer: sample("music", { id: "tray", title: "Your song", artist: "Any artist", artwork: null, preview: null }, 0), zoom: 0.8, tilt: 4 },
  { key: "mention", label: "Mention", layer: sample("mention", { username: "someone" }, 3), zoom: 0.8, tilt: -5 },
  { key: "link", label: "Link", layer: sample("link", { url: "https://hypefy.chat" }, 6), zoom: 0.8, tilt: 3 },
  { key: "location", label: "Location", layer: sample("location", { place: "Mumbai" }, 3), zoom: 0.8, tilt: -3 },
  { key: "hashtag", label: "Hashtag", layer: sample("hashtag", { tag: "weekend" }, 5), zoom: 0.8, tilt: 4 },
  { key: "time", label: "Time", layer: sample("time", { at: new Date().toISOString() }, 0), zoom: 0.8, tilt: -4 },
];

export const ALL_TILES: Tile[] = [...ASK_AND_PLAY, ...HYPE_AND_PLAN, ...YOURS, ...TAGS];

const SAMPLE_EMBEDS: Record<string, EmbedState> = {
  [SAMPLE_EMBED_ID]: { thumb: null, caption: "Something you posted" },
};

/** Recently used, on this device only, newest first. */
const RECENT_KEY = "hypefy:show-sticker-recent";
const RECENT_MAX = 4;

function readRecent(): WidgetKey[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(raw)
      ? raw.filter((k): k is WidgetKey => ALL_TILES.some((t) => t.key === k)).slice(0, RECENT_MAX)
      : [];
  } catch {
    return [];
  }
}

/** The recent list after using `key`: it goes to the front, once. */
export function nextRecent(recent: readonly WidgetKey[], key: WidgetKey): WidgetKey[] {
  return [key, ...recent.filter((k) => k !== key)].slice(0, RECENT_MAX);
}

function rememberRecent(key: WidgetKey) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(nextRecent(readRecent(), key)));
  } catch {
    // A private window or a full disk: the tray still works, it just forgets.
  }
}

/** The coloured pin a big sticker hangs from. */
const PINS = ["#a3e635", "#38bdf8", "#f472b6", "#fde047"];

/**
 * The sticker at its real size, scaled down — so the tile cannot drift
 * from what gets placed. `zoom` rather than a transform, so the row lays
 * out around what you see, not around the full-size original.
 */
function Shrunk({ tile }: { tile: Tile }) {
  return (
    <span aria-hidden className="pointer-events-none block" style={{ zoom: tile.zoom }}>
      <span className="block drop-shadow-[0_10px_20px_rgba(0,0,0,0.4)]">
        <LayerBody layer={tile.layer} editing embeds={SAMPLE_EMBEDS} />
      </span>
    </span>
  );
}

function Pinned({ tile, index, onPick }: { tile: Tile; index: number; onPick: (key: WidgetKey) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(tile.key)}
      aria-label={`Add ${tile.label.toLowerCase()}`}
      className="flex shrink-0 flex-col items-center gap-2.5 transition active:scale-95"
      data-tile={tile.key}
    >
      <span className="relative block" style={{ transform: `rotate(${tile.tilt}deg)` }}>
        <span
          aria-hidden
          className="absolute -top-2 left-1/2 z-10 block h-3.5 w-3.5 -translate-x-1/2 rounded-full shadow-[0_2px_4px_rgba(0,0,0,0.45),inset_0_-2px_0_rgba(0,0,0,0.2)]"
          style={{ background: PINS[index % PINS.length] }}
        />
        <Shrunk tile={tile} />
      </span>
      <span className="text-[13px] font-bold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">{tile.label}</span>
    </button>
  );
}

function Shelf({
  title,
  tiles,
  onPick,
  hint = false,
}: {
  title: string;
  tiles: Tile[];
  onPick: (key: WidgetKey) => void;
  hint?: boolean;
}) {
  return (
    <section className="mt-5">
      <div className="flex items-baseline justify-between px-5">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">{title}</h2>
        {hint && <span className="text-[11px] font-semibold text-white/60">Swipe</span>}
      </div>
      <div className="no-scrollbar flex items-end gap-5 overflow-x-auto px-5 pb-1 pt-5">
        {tiles.map((t, i) => (
          <Pinned key={t.key} tile={t} index={i} onPick={onPick} />
        ))}
      </div>
    </section>
  );
}

/**
 * Everything that can go on a Show, as a pinboard on glass.
 *
 * The photo you are decorating stays in view behind it, and tapping the
 * photo puts it away. No emoji: the keyboard has those, and a text layer
 * takes them.
 */
export function StickerTray({
  onWidget,
  onClose,
}: {
  onWidget: (key: WidgetKey) => void;
  onClose: () => void;
}) {
  const [recent] = useState<WidgetKey[]>(readRecent);
  const pick = (key: WidgetKey) => {
    rememberRecent(key);
    onWidget(key);
  };

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end" data-sticker-tray>
      {/* Tapping the picture puts the tray away. */}
      <button
        type="button"
        aria-label="Close stickers"
        onClick={onClose}
        onPointerDown={(e) => e.stopPropagation()}
        className="min-h-[18%] flex-1 bg-gradient-to-b from-transparent to-black/50"
      />

      <div
        role="dialog"
        aria-label="Add to your Show"
        onPointerDown={(e) => e.stopPropagation()}
        className="animate-rise max-h-[82%] overflow-y-auto rounded-t-[28px] border-t border-white/10 bg-black/55 pb-[max(1.25rem,var(--sab))] pt-2 text-white shadow-[0_-12px_40px_rgba(0,0,0,0.35)] backdrop-blur-2xl backdrop-saturate-150"
      >
        <span aria-hidden className="mx-auto mb-1 block h-1 w-10 rounded-full bg-white/30" />

        {recent.length > 0 && (
          <div className="mt-3 flex items-center gap-2 px-5" data-recent>
            <h2 className="mr-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">Recent</h2>
            {recent.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => pick(key)}
                className="h-8 rounded-[11px] bg-white/15 px-3 text-xs font-bold transition hover:bg-white/25 active:scale-95"
              >
                {ALL_TILES.find((t) => t.key === key)?.label}
              </button>
            ))}
          </div>
        )}

        {/* Tags first: the quick ones people reach for most. */}
        <section className="mt-5">
          <h2 className="px-5 text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">Tags</h2>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-4 px-4 pt-4">
            {TAGS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => pick(t.key)}
                aria-label={`Add ${t.label.toLowerCase()}`}
                className="flex flex-col items-center gap-2 transition active:scale-95"
                data-tile={t.key}
              >
                <span className="block" style={{ transform: `rotate(${t.tilt}deg)` }}>
                  <Shrunk tile={t} />
                </span>
                <span className="text-xs font-bold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">{t.label}</span>
              </button>
            ))}
          </div>
        </section>

        <Shelf title="Ask & play" tiles={ASK_AND_PLAY} onPick={pick} hint />
        <Shelf title="Hype & plan" tiles={HYPE_AND_PLAN} onPick={pick} hint />
        <Shelf title="Yours" tiles={YOURS} onPick={pick} />

      </div>
    </div>
  );
}
