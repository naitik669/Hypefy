"use client";

import { useEffect } from "react";
import { RefreshCw, AlertCircle } from "lucide-react";
import { useCamera } from "@/lib/useCamera";
import { haptics } from "@/lib/haptics";
import {
  FilterCarousel,
  FilterRailButton,
  useFilterState,
  viewfinderFilter,
} from "@/components/camera/FilterCarousel";
import { BLANK_POSTER } from "@/lib/blank-poster";

/**
 * LiveCamera — real-time camera viewfinder for the Shows creator.
 *
 * Opens the front camera. The right rail flips the camera and opens filters;
 * with filters open, the shutter sits among them. The capture is a
 * full-resolution still where the phone allows it, cropped to the 9:16
 * frame you saw and filtered, returned as a JPEG File via `onCapture`.
 */
export function LiveCamera({
  onCapture,
  onFiltersOpenChange,
}: {
  onCapture: (file: File) => void;
  /** So the page can clear its own bottom-left buttons out of the carousel's way. */
  onFiltersOpenChange?: (open: boolean) => void;
}) {
  const { videoRef, ready, error, retry, flip, capturePhoto, snapshot, mirrored, isLandscape } = useCamera({
    facingDefault: "user",
    portrait: true,
    audio: false,
  });
  const filters = useFilterState();
  const look = viewfinderFilter(filters.selected);

  useEffect(() => {
    onFiltersOpenChange?.(filters.open);
  }, [filters.open, onFiltersOpenChange]);

  async function capture() {
    haptics.tap();
    const file = await capturePhoto(`show-${Date.now()}.jpg`, filters.selected);
    if (file) onCapture(file);
  }

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-black">
      {/* Live preview, letterboxed to the 9:16 the photo is saved at. The
          front camera is mirrored so it feels like a mirror. */}
      <div className="flex h-full w-full items-center justify-center">
        <div className="relative aspect-[9/16] max-h-full w-full overflow-hidden">
          <video poster={BLANK_POSTER}
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`h-full w-full ${isLandscape ? "object-contain" : "object-cover"} ${mirrored ? "[transform:scaleX(-1)]" : ""}`}
            style={{ filter: look.filter }}
          />
          {look.tint && <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: look.tint }} />}
        </div>
      </div>

      {error && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/90 px-8 text-center">
          <AlertCircle size={40} className="text-danger" />
          <p className="text-sm text-white/80">{error}</p>
          <button
            type="button"
            onClick={retry}
            className="rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-accent-ink"
          >
            Retry
          </button>
        </div>
      )}

      {/* Right rail, middle of the screen */}
      <div className="absolute right-3 top-1/2 z-10 flex -translate-y-1/2 flex-col items-center gap-1 rounded-pill bg-black/35 py-3 backdrop-blur-sm">
        <button
          type="button"
          aria-label="Flip camera"
          onClick={flip}
          className="flex w-14 flex-col items-center gap-0.5 py-2 text-white transition active:scale-90"
        >
          <RefreshCw size={22} />
          <span className="text-[10px] font-bold">Flip</span>
        </button>
        <FilterRailButton open={filters.open} onClick={() => filters.toggle(snapshot)} />
      </div>

      {/* Bottom: the plain shutter, or the shutter among the filters */}
      <div className="absolute inset-x-0 bottom-8 z-10 flex justify-center">
        {filters.open ? (
          <FilterCarousel
            selected={filters.selected}
            onSelect={filters.select}
            favorites={filters.favorites}
            onToggleFavorite={filters.toggleFavorite}
            onShutter={capture}
            disabled={!ready}
            thumb={filters.thumb}
          />
        ) : (
          <button
            type="button"
            aria-label="Take photo"
            onClick={capture}
            disabled={!ready}
            className="mb-2 flex h-[76px] w-[76px] items-center justify-center rounded-full border-4 border-white bg-white/25 backdrop-blur-sm transition-transform active:scale-90 disabled:opacity-40"
          >
            <div className="h-14 w-14 rounded-full bg-white/80" />
          </button>
        )}
      </div>
    </div>
  );
}
