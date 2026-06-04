"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Images, Type, Send, Loader2, User } from "lucide-react";
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

          {/* Caption — sits just above the action bar */}
          <div className="absolute inset-x-4 bottom-24 z-20">
            {showCaption ? (
              <input
                autoFocus
                value={caption}
                onChange={(e) => setCaption(e.target.value.slice(0, 150))}
                onBlur={() => { if (!caption.trim()) setShowCaption(false); }}
                placeholder="Add a caption…"
                className="w-full rounded-2xl bg-black/35 px-4 py-3 text-base text-white outline-none backdrop-blur-sm placeholder:text-white/55"
              />
            ) : (
              <button
                type="button"
                onClick={() => setShowCaption(true)}
                className="flex items-center gap-2 text-base font-medium text-white/70 drop-shadow"
              >
                <Type size={18} /> {caption || "Add a caption…"}
              </button>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="absolute inset-x-4 bottom-36 z-20">
              <p className="rounded-xl bg-danger/80 px-3 py-2 text-center text-xs text-white backdrop-blur-sm">
                {error}
              </p>
            </div>
          )}

          {/* Bottom action bar — audience pills + send */}
          <div className="absolute inset-x-0 bottom-0 z-20 flex items-center gap-2.5 px-4 pb-9 pt-4">
            <span className="flex items-center gap-2 rounded-pill bg-white/15 py-1.5 pl-1.5 pr-3.5 backdrop-blur-sm">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/25 text-white">
                <User size={15} />
              </span>
              <span className="text-sm font-semibold text-white">Your Show</span>
            </span>
            <span className="rounded-pill bg-white/15 px-3.5 py-2 text-sm font-semibold text-white/75 backdrop-blur-sm">
              24h
            </span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={share}
              disabled={pending}
              aria-label="Share to your Show"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-ink shadow-lg transition-transform active:scale-95 disabled:opacity-60"
            >
              {pending ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
