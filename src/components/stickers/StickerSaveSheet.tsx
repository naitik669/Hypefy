"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, Send, X } from "lucide-react";
import { DEFAULT_STICKER_EDGE, type StickerEdge } from "@hypefy/core/stickers";
import { STROKE_FILTER } from "@/components/stickers/StickerImage";

/**
 * Keep a picture as a sticker: choose its edge, then keep it or send it.
 *
 * The picture fills the screen and every control is a round button floating
 * on it, so nothing takes height away from the picture (Naitik, 27 Nov:
 * "pic should cover more screen and tools should be like overlay button").
 *
 * No name field. A sticker is the picture (Naitik, 27 Nov).
 *
 * This is the step the cutout studio (T2) feeds into: the studio removes the
 * background and hands over a transparent PNG; until it lands, the Create
 * tile brings a picture straight here, background and all.
 */
export function StickerSaveSheet({
  image,
  busy,
  onClose,
  onSave,
  onSend,
}: {
  /** An object URL of the prepared picture. */
  image: string;
  busy: boolean;
  onClose: () => void;
  onSave: (edge: StickerEdge) => void;
  onSend: (edge: StickerEdge) => void;
}) {
  const [edge, setEdge] = useState<StickerEdge>(DEFAULT_STICKER_EDGE);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const float =
    "flex items-center justify-center gap-2 rounded-full bg-black/45 text-white backdrop-blur-md transition active:scale-95 disabled:opacity-50";

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="New sticker" className="fixed inset-0 z-[80] bg-black">
      {/* The picture, edge to edge. A checkerboard behind it shows where it
          is transparent, which is what decides whether "clean" looks right. */}
      <div
        className="absolute inset-0 flex items-center justify-center p-6"
        style={{
          backgroundColor: "#1a1a1a",
          backgroundImage:
            "linear-gradient(45deg,#232323 25%,transparent 25%),linear-gradient(-45deg,#232323 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#232323 75%),linear-gradient(-45deg,transparent 75%,#232323 75%)",
          backgroundSize: "18px 18px",
          backgroundPosition: "0 0,0 9px,9px -9px,-9px 0",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL */}
        <img
          src={image}
          alt="Your sticker"
          className="max-h-full max-w-full object-contain"
          style={{ filter: edge === "stroke" ? STROKE_FILTER : undefined }}
        />
      </div>

      <button
        type="button"
        onClick={onClose}
        disabled={busy}
        aria-label="Close"
        className={`${float} absolute left-4 h-11 w-11`}
        style={{ top: "max(16px, env(safe-area-inset-top))" }}
      >
        <X size={20} />
      </button>

      <div
        className="absolute inset-x-0 flex flex-col items-center gap-3 px-4"
        style={{ bottom: "max(20px, env(safe-area-inset-bottom))" }}
      >
        {/* The edge: one choice, two answers, on the picture itself. */}
        <div role="radiogroup" aria-label="Edge" className="flex gap-1 rounded-full bg-black/45 p-1 backdrop-blur-md">
          {(["stroke", "clean"] as const).map((e) => (
            <button
              key={e}
              type="button"
              role="radio"
              aria-checked={edge === e}
              onClick={() => setEdge(e)}
              className={`h-9 rounded-full px-4 text-[13px] font-bold transition ${
                edge === e ? "bg-white text-black" : "text-white/80 hover:text-white"
              }`}
            >
              {e === "stroke" ? "Stroke" : "Clean"}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button type="button" disabled={busy} onClick={() => onSave(edge)} className={`${float} h-12 px-5 text-sm font-bold`}>
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            Save
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onSend(edge)}
            className="flex h-12 items-center justify-center gap-2 rounded-full bg-accent px-5 text-sm font-bold text-accent-ink transition active:scale-95 disabled:opacity-50"
          >
            <Send size={18} />
            Send
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
