"use client";

import { useState } from "react";
import { AvatarImg } from "@/components/ui/AvatarImg";
import { framePlacement } from "@/lib/frames";
import { FramePlacer, LIMITS, type Placement } from "@/components/admin/FramePlacer";

/** Whose avatar the frame is being judged against. */
export type PreviewAvatar = { avatarUrl: string | null; hue: number; name: string };

/** The sizes an avatar is actually drawn at: a comment, a chat row, a profile. */
const PREVIEW_SIZES = [24, 40, 56];

/**
 * The same frame at the sizes it is actually drawn at.
 *
 * A cell is as wide as the artwork, not as the avatar: a frame reaches
 * past the photo by design, and at any scale it reached past the panel
 * too. The 24px one is the one that matters — a design that only works
 * large is the usual failure, and a comment row is where most people
 * will meet it.
 */
export function PreviewRow({
  src,
  place,
  preview,
}: {
  src: string;
  place: Placement;
  preview: PreviewAvatar;
}) {
  return (
    <div className="flex items-end gap-5 overflow-x-auto pb-1">
      {PREVIEW_SIZES.map((size) => {
        const box = framePlacement(size, place);
        const cell = Math.max(size, Math.ceil(box.width));
        const inset = (cell - size) / 2;
        return (
          <span key={size} className="flex shrink-0 flex-col items-center gap-2">
            <span className="relative inline-block" style={{ width: cell, height: cell }}>
              <span className="absolute" style={{ left: inset, top: inset }}>
                <AvatarImg url={preview.avatarUrl} name={preview.name} hue={preview.hue} size={size} />
              </span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt=""
                aria-hidden
                className="pointer-events-none absolute max-w-none"
                style={{
                  left: inset + box.left,
                  top: inset + box.top,
                  width: box.width,
                  height: box.height,
                  transform: box.transform,
                }}
              />
            </span>
            <span className="font-mono text-[10px] text-faint">{size}px</span>
          </span>
        );
      })}
    </div>
  );
}

/**
 * Re-place a frame that is already live.
 *
 * Placing one used to be something you could only do on the way in — the
 * placer lived in the upload form — so a frame that turned out to sit a
 * little high had to be uploaded again under a new id, leaving the old
 * one retired behind it. This is the same four numbers, after the fact.
 *
 * The draft is local and nothing is written until Save, because this
 * edits something people are already wearing: a save is visible on every
 * avatar carrying the frame, and dragging your way to something worse
 * should cost nothing but the walk back.
 */
export function FramePlacement({
  saved,
  url,
  preview,
  onSave,
}: {
  /** Where the catalogue currently says this frame sits. */
  saved: Placement;
  url: string;
  preview: PreviewAvatar;
  onSave: (next: Placement) => Promise<boolean>;
}) {
  const [place, setPlace] = useState<Placement>(saved);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Placement>) => setPlace((p) => ({ ...p, ...patch }));
  const moved =
    place.scale !== saved.scale ||
    place.offsetX !== saved.offsetX ||
    place.offsetY !== saved.offsetY ||
    place.rotation !== saved.rotation;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-elevated p-3">
      <p className="text-xs font-bold tracking-widest text-faint uppercase">Placement</p>

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
        <FramePlacer
          src={url}
          value={place}
          onChange={setPlace}
          avatar={{ url: preview.avatarUrl, hue: preview.hue, name: preview.name }}
          stage={320}
        />

        <div className="flex flex-col gap-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Slider label="Size" value={place.scale} min={LIMITS.scale[0]} max={LIMITS.scale[1]} step={0.01} onChange={(v) => set({ scale: v })} />
            <Slider label="Turn" value={place.rotation} min={LIMITS.rotation[0]} max={LIMITS.rotation[1]} step={1} onChange={(v) => set({ rotation: v })} />
            <Slider label="Left / right" value={place.offsetX} min={LIMITS.offset[0]} max={LIMITS.offset[1]} step={0.005} onChange={(v) => set({ offsetX: v })} />
            <Slider label="Up / down" value={place.offsetY} min={LIMITS.offset[0]} max={LIMITS.offset[1]} step={0.005} onChange={(v) => set({ offsetY: v })} />
          </div>

          <PreviewRow src={url} place={place} preview={preview} />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!moved || busy}
              onClick={async () => {
                setBusy(true);
                await onSave(place);
                setBusy(false);
              }}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-extrabold text-accent-ink transition active:scale-[0.99] disabled:opacity-40"
            >
              {busy ? "Saving…" : "Save placement"}
            </button>
            <button
              type="button"
              disabled={!moved || busy}
              onClick={() => setPlace(saved)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted disabled:opacity-40"
            >
              Revert
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setPlace({ scale: 1, offsetX: 0, offsetY: 0, rotation: 0 })}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted disabled:opacity-40"
            >
              Centre it
            </button>
            {moved && <span className="text-[11px] font-semibold text-accent">Not saved yet.</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="flex items-center gap-3 text-xs">
      <span className="w-20 shrink-0 text-muted">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-w-0 flex-1 accent-[var(--color-accent)]"
      />
      <span className="w-12 shrink-0 text-right font-mono tabular-nums text-faint">{value.toFixed(2)}</span>
    </label>
  );
}
