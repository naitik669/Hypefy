"use client";

import { useEffect, useRef, useState } from "react";
import { Images, RefreshCw, X } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ImageCropper } from "@/components/post/ImageCropper";
import { cameraSupported, openCamera, stopStream, type Facing } from "@/lib/camera";
import { haptics } from "@/lib/haptics";
import { BLANK_POSTER } from "@/lib/blank-poster";

/**
 * Taking the picture for a page, without leaving the page you are writing.
 *
 * A sheet rather than a screen: Spotlight stays behind it, the half-written
 * words stay on screen, the shutter is where the thumb already is, and a
 * swipe down drops the whole thing. The square in the corner opens the
 * library for anyone who would rather send something they already have.
 *
 * Whatever arrives — camera or library — goes through the same square crop
 * the rest of the app uses, so a page is one shape in the deck.
 */
export function PagePhotoPicker({
  open,
  onClose,
  onPicked,
}: {
  open: boolean;
  onClose: () => void;
  /** A square JPEG, ready to upload. */
  onPicked: (blob: Blob) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const [facing, setFacing] = useState<Facing>("environment");
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  /** What is waiting to be cropped, camera or library alike. */
  const [cropping, setCropping] = useState<string | null>(null);

  // The camera runs only while the sheet is open and nothing is being cropped.
  useEffect(() => {
    if (!open || cropping || !cameraSupported()) return;
    let dropped = false;
    openCamera(facing, false)
      .then((s) => {
        if (dropped) {
          stopStream(s);
          return;
        }
        stream.current = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play().catch(() => {});
        }
        setFailed(false);
        setReady(true);
      })
      .catch(() => {
        if (dropped) return;
        setReady(false);
        setFailed(true);
      });
    return () => {
      dropped = true;
      stopStream(stream.current);
      stream.current = null;
    };
  }, [open, facing, cropping]);

  function shoot() {
    const v = video.current;
    if (!v || !ready) return;
    haptics.tap();
    // Grabbed at the frame's own size; the cropper does the squaring, so
    // nothing is thrown away before you have chosen what to keep.
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (facing === "user") {
      // The preview is mirrored, so the picture has to be too — otherwise
      // what you took is not what you were looking at.
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) setCropping(URL.createObjectURL(blob));
    }, "image/jpeg", 0.92);
  }

  function fromLibrary(picked: File | undefined) {
    if (!picked) return;
    setCropping(URL.createObjectURL(picked));
  }

  function done(blob: Blob) {
    if (cropping) URL.revokeObjectURL(cropping);
    setCropping(null);
    onPicked(blob);
    onClose();
  }

  return (
    <>
      <BottomSheet open={open && !cropping} onClose={onClose} title="Add a photo">
        <div className="px-4 pb-5">
          <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-black">
            {failed || !cameraSupported() ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                <p className="text-sm font-bold">No camera here</p>
                <p className="text-xs text-muted">Pick something from your photos instead.</p>
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
            <span className="absolute left-3 top-3 rounded-lg bg-black/55 px-2 py-1 text-[10px] font-extrabold tracking-wide text-white backdrop-blur-sm">
              PAGE · 1:1
            </span>
          </div>

          <div className="mt-4 flex items-center justify-between px-2">
            <button
              type="button"
              onClick={() => file.current?.click()}
              aria-label="Choose from photos"
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-elevated text-foreground"
            >
              <Images size={19} />
            </button>

            <button
              type="button"
              onClick={shoot}
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
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-elevated text-foreground"
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
              fromLibrary(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      </BottomSheet>

      {cropping && (
        <ImageCropper
          src={cropping}
          aspect={1}
          label="Crop photo"
          onCancel={() => {
            URL.revokeObjectURL(cropping);
            setCropping(null);
          }}
          onDone={(blob) => done(blob)}
        />
      )}
    </>
  );
}
