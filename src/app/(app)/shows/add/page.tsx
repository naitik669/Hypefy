"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  Camera,
  Images,
  Type,
  Sparkles,
  Send,
} from "lucide-react";

type State = "idle" | "preview" | "posting" | "done";

export default function AddShowPage() {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const [state, setState] = useState<State>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [showCaption, setShowCaption] = useState(false);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setState("preview");
  }

  function discard() {
    setPreviewUrl(null);
    setCaption("");
    setShowCaption(false);
    setState("idle");
  }

  function share() {
    setState("posting");
    // Simulate network delay, then go back.
    setTimeout(() => {
      router.back();
    }, 800);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* ── IDLE — choose source ─────────────────────────────── */}
      {state === "idle" && (
        <>
          {/* Top bar */}
          <div className="flex items-center justify-between px-4 pb-2 pt-14">
            <button
              type="button"
              aria-label="Close"
              onClick={() => router.back()}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white"
            >
              <X size={20} />
            </button>
            <span className="text-base font-extrabold tracking-tight text-white">
              Your Show
            </span>
            <span className="rounded-pill border border-white/30 px-2.5 py-0.5 text-xs text-white/60">
              24h
            </span>
          </div>

          {/* Hero area — camera viewfinder stand-in */}
          <div className="mx-4 flex flex-1 flex-col items-center justify-center gap-6 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
            {/* Subtle aperture decoration */}
            <div className="relative flex h-28 w-28 items-center justify-center">
              <div className="absolute inset-0 rounded-full border-2 border-dashed border-white/20" />
              <Camera size={44} className="text-white/40" strokeWidth={1.5} />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-white">Add to your Show</p>
              <p className="mt-1 text-sm text-white/50">
                Share a moment — it disappears in 24 hours.
              </p>
            </div>
          </div>

          {/* Bottom action row */}
          <div className="flex items-center justify-around px-8 pb-12 pt-6">
            {/* Gallery */}
            <button
              type="button"
              aria-label="Pick from gallery"
              onClick={() => galleryRef.current?.click()}
              className="flex flex-col items-center gap-2"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-white">
                <Images size={26} />
              </span>
              <span className="text-xs text-white/60">Gallery</span>
            </button>

            {/* Camera — big center shutter */}
            <button
              type="button"
              aria-label="Take a photo"
              onClick={() => cameraRef.current?.click()}
              className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-white/20 text-white transition-transform active:scale-95"
            >
              <Camera size={32} />
            </button>

            {/* Accent tile */}
            <button
              type="button"
              aria-label="Use template"
              className="flex flex-col items-center gap-2 opacity-50"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-white">
                <Sparkles size={24} />
              </span>
              <span className="text-xs text-white/60">Effects</span>
            </button>
          </div>

          {/* Hidden inputs */}
          <input
            ref={cameraRef}
            type="file"
            accept="image/*,video/*"
            capture="environment"
            className="hidden"
            onChange={handleFile}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={handleFile}
          />
        </>
      )}

      {/* ── PREVIEW ──────────────────────────────────────────── */}
      {(state === "preview" || state === "posting") && previewUrl && (
        <>
          {/* Media fill */}
          <div className="absolute inset-0">
            {previewUrl.startsWith("blob:") && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Show preview"
                className="h-full w-full object-cover"
              />
            )}
          </div>

          {/* Dark gradient top / bottom */}
          <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/60 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-60 bg-gradient-to-t from-black/80 to-transparent" />

          {/* Top controls */}
          <div className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between px-4 pt-14">
            <button
              type="button"
              aria-label="Discard"
              onClick={discard}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm"
            >
              <X size={20} />
            </button>

            <button
              type="button"
              aria-label="Add caption"
              onClick={() => setShowCaption((v) => !v)}
              className={`flex h-9 w-9 items-center justify-center rounded-full backdrop-blur-sm transition-colors ${
                showCaption ? "bg-accent text-accent-ink" : "bg-black/40 text-white"
              }`}
            >
              <Type size={18} />
            </button>
          </div>

          {/* Caption overlay */}
          {showCaption && (
            <div className="absolute inset-x-4 top-1/2 z-20 -translate-y-1/2">
              <input
                autoFocus
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Add a caption…"
                className="w-full bg-transparent text-center text-xl font-bold text-white outline-none placeholder:text-white/40 drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]"
              />
            </div>
          )}

          {/* Bottom — Share */}
          <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between px-6 pb-12">
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm"
            >
              <Images size={22} />
            </button>

            <button
              type="button"
              onClick={share}
              disabled={state === "posting"}
              className="flex h-14 items-center gap-2 rounded-pill bg-accent px-6 text-sm font-bold text-accent-ink shadow-[0_0_20px_4px_rgba(200,255,0,0.4)] transition-transform active:scale-95 disabled:opacity-60"
            >
              {state === "posting" ? (
                "Sharing…"
              ) : (
                <>
                  <Send size={18} />
                  Share to Show
                </>
              )}
            </button>

            {/* Hidden gallery re-pick */}
            <input
              ref={galleryRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={handleFile}
            />

            {/* Spacer for alignment */}
            <div className="h-12 w-12" />
          </div>
        </>
      )}
    </div>
  );
}
