"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LayerBody } from "@/components/shows/LayerView";
import { StyleCarousel } from "@/components/shows/StyleCarousel";
import { ensurePreviewPlaying, parseTrack, stopPreview } from "@/lib/music";
import {
  MUSIC_LENGTHS,
  SONG_SPAN,
  type MusicPayload,
  type MusicStyle,
  type ShowLayer,
} from "@/lib/show-layers";

/** The icon for each style: filled, the way the rail's are bold. */
const STYLE_ICON: Record<MusicStyle, React.ReactNode> = {
  only: (
    <svg aria-hidden width="26" height="26" viewBox="0 0 24 24">
      <path fill="currentColor" d="M8.5 6.2V16a3.5 3.5 0 1 1-2-3.2V4.8L21 2.5v4z" />
      <path d="M2.5 3.5l18 18" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  ),
  type: <span aria-hidden className="text-[21px] font-extrabold tracking-[-0.06em]">Aa</span>,
  banner: (
    <svg aria-hidden width="30" height="24" viewBox="0 0 30 24">
      <rect x="1" y="4" width="28" height="16" rx="6" fill="currentColor" />
      <circle cx="9" cy="12" r="5.5" fill="#1f1f1f" />
      <circle cx="9" cy="12" r="1.6" fill="currentColor" />
      <rect x="17" y="9" width="8" height="2.4" rx="1.2" fill="#1f1f1f" />
      <rect x="17" y="13" width="5" height="2.4" rx="1.2" fill="#1f1f1f" />
    </svg>
  ),
  cd: (
    <svg aria-hidden width="26" height="26" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10.5" fill="currentColor" />
      <circle cx="12" cy="12" r="3.2" fill="#1f1f1f" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" />
    </svg>
  ),
  waves: (
    <svg aria-hidden width="26" height="24" viewBox="0 0 26 24" fill="currentColor">
      <rect x="1" y="9" width="3.4" height="6" rx="1.7" />
      <rect x="6.2" y="5" width="3.4" height="14" rx="1.7" />
      <rect x="11.3" y="1.5" width="3.4" height="21" rx="1.7" />
      <rect x="16.4" y="6" width="3.4" height="12" rx="1.7" />
      <rect x="21.6" y="9" width="3.4" height="6" rx="1.7" />
    </svg>
  ),
  cover: (
    <svg aria-hidden width="24" height="26" viewBox="0 0 24 26">
      <rect x="2" y="1" width="20" height="24" rx="5" fill="currentColor" />
      <rect x="5" y="4" width="14" height="12" rx="3" fill="#1f1f1f" />
      <rect x="5" y="19" width="9" height="2.6" rx="1.3" fill="#1f1f1f" />
    </svg>
  ),
};

const STYLE_NAME: Record<MusicStyle, string> = {
  only: "Music only",
  type: "Type",
  banner: "Banner",
  cd: "CD",
  waves: "Waves",
  cover: "Cover",
};

/** The carousel's order: Music only first, Banner where the eye lands. */
const ORDER: MusicStyle[] = ["only", "type", "banner", "cd", "waves", "cover"];

/** A sound graph for a song that has none to read: fixed per song, so it does not shuffle. */
export function soundGraph(seed: string, bars: number): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const wobble = (h % 1000) / 1000;
    out.push(0.25 + 0.75 * Math.abs(Math.sin(i * 0.45) * Math.cos(i * 0.13)) * (0.55 + 0.45 * wobble));
  }
  return out;
}

/** Where a part of `length` seconds may start, kept inside the song. */
export function clampStart(start: number, length: number): number {
  return Math.min(Math.max(0, Math.round(start * 2) / 2), SONG_SPAN - length);
}

/**
 * A song on a Show, being arranged.
 *
 * Its styles are icons on a carousel under it, swiped or tapped, and the
 * one in the middle is the one it wears. Under that is one line: how
 * long it plays, as a squircle that opens to 5–30 seconds, and the song
 * as a sound graph with a window on it — drag the window to the part that
 * plays. The part plays while you choose it.
 */
export function MusicEditor({
  layer,
  onChange,
  onColour,
  onCancel,
  onDone,
}: {
  layer: ShowLayer;
  onChange: (payload: MusicPayload) => void;
  onColour: () => void;
  onCancel: () => void;
  onDone: () => void;
}) {
  const music = layer.payload as MusicPayload;
  const style = music.style ?? "banner";
  const length = music.length ?? 15;
  const start = clampStart(music.start ?? 0, length);
  const [lengths, setLengths] = useState(false);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const bars = useMemo(() => soundGraph(music.id, 52), [music.id]);

  const set = (patch: Partial<MusicPayload>) => onChange({ ...music, ...patch });

  // The part plays while it is being chosen, and stops when this closes.
  const track = parseTrack({ ...music, artwork: music.artwork ?? "", preview: music.preview ?? "", start, length });
  const trackKey = track ? `${track.id}:${start}:${length}` : "";
  useEffect(() => {
    if (!track) return;
    ensurePreviewPlaying(track, { loop: true, audible: true, restart: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackKey]);
  useEffect(() => () => stopPreview(), []);

  /** Dragging the window along the sound graph moves the part that plays. */
  function onStripDown(e: React.PointerEvent) {
    const strip = stripRef.current;
    if (!strip) return;
    e.preventDefault();
    const rect = strip.getBoundingClientRect();
    const perSecond = rect.width / SONG_SPAN;
    const grabbed = e.clientX - rect.left - start * perSecond;
    // A press outside the window centres it there; inside, it is held where it was grabbed.
    const offset = grabbed >= 0 && grabbed <= length * perSecond ? grabbed : (length * perSecond) / 2;
    const at = (clientX: number) => clampStart((clientX - rect.left - offset) / perSecond, length);
    set({ start: at(e.clientX) });
    const move = (ev: PointerEvent) => set({ start: at(ev.clientX) });
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  return (
    <div
      className="absolute inset-0 z-40 bg-black/25"
      onPointerDown={(e) => e.stopPropagation()}
      style={{ touchAction: "none" }}
      data-music-editor
    >
      <div className="absolute inset-x-2.5 top-3 flex items-center justify-between [filter:drop-shadow(0_1px_1.5px_rgba(0,0,0,0.6))_drop-shadow(0_0_8px_rgba(0,0,0,0.3))]">
        <button type="button" onClick={onCancel} className="h-11 px-2 text-[15px] font-extrabold text-white">
          Cancel
        </button>
        <button
          type="button"
          onClick={onColour}
          aria-label="Change colour"
          className="h-11 w-11 rounded-[15px] border-[3px] border-white transition active:scale-90"
          style={{ background: "conic-gradient(#ef4444, #f59e0b, #a3e635, #22d3ee, #6366f1, #d946ef, #ef4444)" }}
        />
        <button
          type="button"
          onClick={onDone}
          className="h-10 rounded-[14px] bg-accent px-[18px] text-[15px] font-extrabold text-accent-ink [filter:none] transition active:scale-95"
        >
          Done
        </button>
      </div>

      <div className="absolute inset-x-0 top-[34%] flex justify-center">
        {style === "only" ? (
          <div className="flex flex-col items-center gap-2 text-white [text-shadow:0_2px_8px_rgba(0,0,0,0.45)]">
            <span className="text-[26px] font-extrabold">Music only</span>
            <span className="max-w-[300px] truncate text-[13px] font-bold text-white/85">
              {music.title} plays · nothing on the picture
            </span>
          </div>
        ) : (
          <span style={{ transform: `rotate(${layer.rotation}deg) scale(1.15)` }} className="block">
            <LayerBody layer={layer} editing />
          </span>
        )}
      </div>

      {/* The styles: a carousel of icons, the middle one chosen. */}
      <div className="absolute inset-x-0 bottom-[148px]">
        <StyleCarousel
          label="Music sticker style"
          options={ORDER.map((s) => ({ key: s, name: STYLE_NAME[s], icon: STYLE_ICON[s] }))}
          value={style}
          onChange={(next) => set({ style: next })}
        />
      </div>

      {/* One line: how long, and which part. */}
      <div className="absolute inset-x-3.5 bottom-[max(1.75rem,var(--sab))] flex items-center gap-2.5">
        <div className="relative shrink-0">
          {lengths && (
            <div
              role="listbox"
              aria-label="How long it plays"
              className="absolute bottom-[86px] left-0 flex w-[72px] flex-col gap-0.5 rounded-[18px] bg-neutral-900/80 p-1.5 shadow-[0_12px_30px_rgba(0,0,0,0.4)] backdrop-blur-md"
            >
              {MUSIC_LENGTHS.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="option"
                  aria-selected={n === length}
                  onClick={() => {
                    set({ length: n, start: clampStart(start, n) });
                    setLengths(false);
                  }}
                  className={`h-10 rounded-xl text-sm font-extrabold ${n === length ? "bg-white text-black" : "text-white"}`}
                >
                  {n}s
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={lengths}
            aria-label={`Plays for ${length} seconds`}
            onClick={() => setLengths((o) => !o)}
            className={`h-[76px] w-[58px] rounded-[20px] text-sm font-extrabold transition active:scale-95 ${
              lengths ? "bg-white text-black" : "bg-white/20 text-white backdrop-blur-sm"
            }`}
          >
            {length}s
          </button>
        </div>
        <div
          ref={stripRef}
          onPointerDown={onStripDown}
          role="slider"
          aria-label="The part that plays"
          aria-valuemin={0}
          aria-valuemax={SONG_SPAN - length}
          aria-valuenow={start}
          aria-valuetext={`From ${start} seconds`}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") set({ start: clampStart(start - 1, length) });
            if (e.key === "ArrowRight") set({ start: clampStart(start + 1, length) });
          }}
          className="relative h-[76px] flex-1 overflow-hidden rounded-[20px] bg-white/[0.14] backdrop-blur-sm"
        >
          <div aria-hidden className="absolute inset-0 flex items-center justify-between px-2">
            {bars.map((h, i) => {
              const t = (i / bars.length) * SONG_SPAN;
              const inside = t >= start && t < start + length;
              return (
                <span
                  key={i}
                  className="block w-[3px] rounded-full"
                  style={{ height: `${Math.round(h * 62)}px`, background: inside ? "#ffffff" : "rgba(255,255,255,0.45)" }}
                />
              );
            })}
          </div>
          <span
            aria-hidden
            className="absolute bottom-[5px] top-[5px] block rounded-[15px] border-[3px] border-accent"
            style={{ left: `${(start / SONG_SPAN) * 100}%`, width: `${(length / SONG_SPAN) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
