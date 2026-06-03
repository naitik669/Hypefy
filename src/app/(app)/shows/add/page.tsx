"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Images, Type, Send, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { LiveCamera } from "@/components/shows/LiveCamera";

type State = "camera" | "preview" | "posting" | "done";

export default function AddShowPage() {
  const router = useRouter();
  const supabase = createClient();
  const galleryRef = useRef<HTMLInputElement>(null);

  const [state, setState] = useState<State>("camera");
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [showCaption, setShowCaption] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onCapture(file: File) {
    setCapturedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setState("preview");
  }

  function onGalleryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCapturedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setState("preview");
  }

  function discard() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setCapturedFile(null);
    setPreviewUrl(null);
    setCaption("");
    setShowCaption(false);
    setError(null);
    setState("camera");
  }

  function share() {
    if (!capturedFile) return;
    setError(null);
    startTransition(async () => {
      // 1. Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError("Not signed in."); return; }

      // 2. Upload media
      const ext = capturedFile.name.split(".").pop() ?? "jpg";
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("show-media")
        .upload(path, capturedFile, { contentType: capturedFile.type, upsert: false });

      if (uploadErr) { setError("Upload failed: " + uploadErr.message); return; }

      const { data: pub } = supabase.storage.from("show-media").getPublicUrl(path);

      // 3. Insert into shows table (a 24-hour Story)
      const { error: insertErr } = await supabase.from("shows").insert({
        user_id: user.id,
        media_url: pub.publicUrl,
        caption: caption.trim() || null,
      });

      if (insertErr) { setError(insertErr.message); return; }

      router.push("/home");
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">

      {/* ── CAMERA STATE ──────────────────────────────────── */}
      {state === "camera" && (
        <>
          {/* Top bar */}
          <div className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between px-4 pb-2 pt-14">
            <button
              type="button"
              aria-label="Close"
              onClick={() => router.back()}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm"
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

          {/* Live camera (fills screen) */}
          <div className="flex-1 overflow-hidden">
            <LiveCamera onCapture={onCapture} />
          </div>

          {/* Gallery fallback — bottom-left of the shutter area */}
          <div className="absolute bottom-10 left-8 z-10">
            <button
              type="button"
              aria-label="Pick from gallery"
              onClick={() => galleryRef.current?.click()}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm"
            >
              <Images size={22} />
            </button>
            <input
              ref={galleryRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={onGalleryChange}
            />
          </div>
        </>
      )}

      {/* ── PREVIEW STATE ──────────────────────────────────── */}
      {(state === "preview" || pending) && previewUrl && (
        <>
          {/* Media preview */}
          <div className="absolute inset-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Show preview"
              className="h-full w-full object-cover"
            />
          </div>
          <div className="absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-black/60 to-transparent" />
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
              aria-label="Toggle caption"
              onClick={() => setShowCaption((v) => !v)}
              className={`flex h-9 w-9 items-center justify-center rounded-full backdrop-blur-sm transition-colors ${
                showCaption ? "bg-accent text-accent-ink" : "bg-black/40 text-white"
              }`}
            >
              <Type size={18} />
            </button>
          </div>

          {/* Caption input overlay */}
          {showCaption && (
            <div className="absolute inset-x-6 top-1/2 z-20 -translate-y-1/2">
              <input
                autoFocus
                value={caption}
                onChange={(e) => setCaption(e.target.value.slice(0, 150))}
                placeholder="Add a caption…"
                className="w-full bg-transparent text-center text-xl font-bold text-white outline-none placeholder:text-white/40 drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]"
              />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="absolute inset-x-4 bottom-32 z-20">
              <p className="rounded-xl bg-danger/80 px-3 py-2 text-center text-xs text-white backdrop-blur-sm">
                {error}
              </p>
            </div>
          )}

          {/* Share button */}
          <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-center pb-12">
            <button
              type="button"
              onClick={share}
              disabled={pending}
              className="flex h-14 items-center gap-2 rounded-pill bg-accent px-8 text-sm font-bold text-accent-ink transition-transform active:scale-95 disabled:opacity-60"
            >
              {pending ? (
                <><Loader2 size={18} className="animate-spin" /> Sharing…</>
              ) : (
                <><Send size={18} /> Share to Show</>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
