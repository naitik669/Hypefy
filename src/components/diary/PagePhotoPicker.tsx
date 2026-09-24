"use client";

import { useEffect, useRef, useState } from "react";
import { Images, RefreshCw, X } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { cameraSupported, openCamera, stopStream, type Facing } from "@/lib/camera";
import { haptics } from "@/lib/haptics";
import { BLANK_POSTER } from "@/lib/blank-poster";

/**
 * Taking the picture for a page, without leaving the page you are writing.
 *
 * A sheet rather than a screen: Spotlight stays behind it, the half-written
 * words stay on screen, the shutter is where the thumb already is, and a
 * swipe down drops the whole thing. The square in the corner opens the
 * library for anyone who would rather use something they already have.
 *
 * No crop step, no filters, nothing to arrange: press the button and it is on
 * your page. A page is written in a minute, and every screen in between is a
 * reason not to bother. What the preview shows is the square that gets taken,
 * and a picture from the library is used as it is.
 */
export function PagePhotoPicker({
  open,
  onClose,
  onPicked,
}: {
  open: boolean;
  onClose: () => void;
  onPicked: (blob: Blob) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const [facing, setFacing] = useState<Facing>("environment");
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // The camera runs only while the sheet is open.
  useEffect(() => {
    if (!open || !cameraSupported()) return;
    let dropped = false;
    let bound: HTMLVideoElement | null = null;
    openCamera(facing, false)
      .then((s) => {
        if (dropped) {
          stopStream(s);
          return;
        }
        stream.current = s;
        const v = video.current;
        setFailed(false);
        if (!v) return;
        bound = v;
        // The shutter waits for the video to be playing, not just for the
        // stream to open. On Android the first frames of a fresh stream come
        // through black, and a picture taken then was uploaded as a black
        // square.
        v.onplaying = () => {
          if (!dropped) setReady(true);
        };
        v.srcObject = s;
        void v.play().catch(() => {});
      })
      .catch(() => {
        if (dropped) return;
        setReady(false);
        setFailed(true);
      });
    return () => {
      dropped = true;
      if (bound) bound.onplaying = null;
      stopStream(stream.current);
      stream.current = null;
      setReady(false);
    };
  }, [open, facing]);

  /** True when a frame is still the camera warming up: every sampled pixel
   *  near black. A real dark room still has noise well above this. */
  function looksBlank(ctx: CanvasRenderingContext2D, side: number): boolean {
    const step = Math.max(1, Math.floor(side / 24));
    const { data } = ctx.getImageData(0, 0, side, side);
    for (let y = 0; y < side; y += step) {
      for (let x = 0; x < side; x += step) {
        const i = (y * side + x) * 4;
        if (data[i] > 8 || data[i + 1] > 8 || data[i + 2] > 8) return false;
      }
    }
    return true;
  }

  function shoot(attempt = 0) {
    const v = video.current;
    if (!v || !ready || v.readyState < 2 || !v.videoWidth) return;
    if (attempt === 0) haptics.tap();

    // The square the preview showed, and nothing else: the preview is
    // object-cover in a square box, so the middle square of the frame is
    // exactly what was on screen.
    const side = Math.min(v.videoWidth, v.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (facing === "user") {
      // The preview is mirrored, so the picture has to be too — otherwise
      // what you took is not what you were looking at.
      ctx.translate(side, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, side, side);
    // Still warming up: try the next frame rather than keep a black square.
    if (looksBlank(ctx, side)) {
      if (attempt < 20) requestAnimationFrame(() => shoot(attempt + 1));
      return;
    }
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onPicked(blob);
        onClose();
      },
      "image/jpeg",
      0.92,
    );
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Add a photo">
      <div className="px-4 pb-5">
        <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-black">
          {failed || !cameraSupported() ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="text-sm font-bold">No camera here</p>
              <p className="text-xs text-muted">Use something from your photos instead.</p>
            </div>
          ) : (
            <video
              poster={BLANK_POSTER}
              ref={video}
              muted
              playsInline
              className={`h-full w-full object-cover ${facing === "user" ? "-scale-x-100" : ""}`}
            />
          )}
        </div>

        <div className="mt-4 flex items-center justify-between px-2">
          <button
            type="button"
            onClick={() => file.current?.click()}
            aria-label="Use a photo from your library"
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-elevated text-foreground transition-transform active:scale-95"
          >
            <Images size={19} />
          </button>

          <button
            type="button"
            onClick={() => shoot()}
            disabled={!ready}
            aria-label="Take photo"
            className="flex h-[62px] w-[62px] items-center justify-center rounded-full border-[3px] border-foreground transition-transform active:scale-90 disabled:opacity-40"
          >
            <span className="h-[50px] w-[50px] rounded-full bg-foreground" />
          </button>

          <button
            type="button"
            onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
            aria-label="Flip camera"
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-elevated text-foreground transition-transform active:scale-95"
          >
            <RefreshCw size={18} />
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mx-auto mt-4 flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-muted"
        >
          <X size={15} /> Cancel
        </button>

        <input
          ref={file}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const picked = e.target.files?.[0];
            e.target.value = "";
            if (!picked) return;
            // Used as it is. The card shows the middle square of it, the way
            // every other picture in the app is framed.
            onPicked(picked);
            onClose();
          }}
        />
      </div>
    </BottomSheet>
  );
}
