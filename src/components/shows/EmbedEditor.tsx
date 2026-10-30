"use client";

import { Repeat2 } from "lucide-react";
import { LayerBody } from "@/components/shows/LayerView";
import { StyleCarousel } from "@/components/shows/StyleCarousel";
import type { EmbedState } from "@/components/shows/ShowWidgetPickers";
import type { EmbedStyle, PostPayload, ShotPayload, ShowLayer } from "@/lib/show-layers";

const STYLES: { key: EmbedStyle; name: string; icon: React.ReactNode }[] = [
  {
    key: "card",
    name: "Card",
    icon: (
      <svg aria-hidden width="24" height="26" viewBox="0 0 24 26">
        <rect x="2" y="1" width="20" height="24" rx="5" fill="currentColor" />
        <rect x="5" y="6" width="14" height="12" rx="3" fill="#1f1f1f" />
        <rect x="5" y="2.8" width="7" height="2" rx="1" fill="#1f1f1f" />
      </svg>
    ),
  },
  {
    key: "tall",
    name: "Tall · plays like a reel",
    icon: (
      <svg aria-hidden width="20" height="28" viewBox="0 0 20 28">
        <rect x="1" y="1" width="18" height="26" rx="5" fill="currentColor" />
        <path d="M8 10v8l6-4z" fill="#1f1f1f" />
      </svg>
    ),
  },
  {
    key: "compact",
    name: "Compact",
    icon: (
      <svg aria-hidden width="28" height="20" viewBox="0 0 28 20">
        <rect x="1" y="2" width="26" height="16" rx="6" fill="currentColor" />
        <rect x="4" y="5" width="10" height="10" rx="3" fill="#1f1f1f" />
        <rect x="16" y="7" width="8" height="2.4" rx="1.2" fill="#1f1f1f" />
        <rect x="16" y="11" width="5" height="2.4" rx="1.2" fill="#1f1f1f" />
      </svg>
    ),
  },
  {
    key: "bubble",
    name: "Bubble",
    icon: (
      <svg aria-hidden width="26" height="26" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10.5" fill="currentColor" />
        <path d="M10 8.5v7l5.5-3.5z" fill="#1f1f1f" />
      </svg>
    ),
  },
];

/**
 * A post or Shot on a Show, being styled: its styles on the same icon
 * carousel a song's are, and Swap for a different one — a Show carries
 * one, so picking another replaces it.
 */
export function EmbedEditor({
  layer,
  embeds,
  onChange,
  onSwap,
  onCancel,
  onDone,
}: {
  layer: ShowLayer;
  embeds: Record<string, EmbedState>;
  onChange: (payload: PostPayload | ShotPayload) => void;
  onSwap: () => void;
  onCancel: () => void;
  onDone: () => void;
}) {
  const payload = layer.payload as PostPayload | ShotPayload;
  const style = payload.style ?? (layer.type === "shot" ? "tall" : "card");

  return (
    <div className="absolute inset-0 z-40 bg-black/25" onPointerDown={(e) => e.stopPropagation()} data-embed-editor>
      <div className="absolute inset-x-2.5 top-3 flex items-center justify-between [filter:drop-shadow(0_1px_1.5px_rgba(0,0,0,0.6))_drop-shadow(0_0_8px_rgba(0,0,0,0.3))]">
        <button type="button" onClick={onCancel} className="h-11 px-2 text-[15px] font-extrabold text-white">
          Cancel
        </button>
        <button
          type="button"
          onClick={onSwap}
          className="flex h-10 items-center gap-1.5 px-2 text-[14px] font-extrabold text-white"
        >
          <Repeat2 size={18} strokeWidth={2.6} />
          Swap
        </button>
        <button
          type="button"
          onClick={onDone}
          className="h-10 rounded-[14px] bg-accent px-[18px] text-[15px] font-extrabold text-accent-ink [filter:none] transition active:scale-95"
        >
          Done
        </button>
      </div>

      <div className="absolute inset-x-0 top-[16%] flex justify-center">
        <span style={{ transform: `rotate(${layer.rotation}deg)` }} className="block">
          <LayerBody layer={layer} editing embeds={embeds} />
        </span>
      </div>

      <div className="absolute inset-x-0 bottom-[max(2rem,var(--sab))]">
        <StyleCarousel
          label="Embed style"
          options={STYLES}
          value={style}
          onChange={(next) => onChange({ ...payload, style: next })}
        />
        <p className="mt-2 text-center text-xs font-semibold text-white/85 [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
          One post or Shot per Show. Picking another swaps this one.
        </p>
      </div>
    </div>
  );
}
