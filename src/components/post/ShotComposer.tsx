"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Video, X, Loader2, Send, Link2, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const MAX_SIZE_MB = 60;
const ALLOWED_TYPES = ["video/mp4", "video/webm", "video/quicktime", "video/ogg"];
const POSTER_WIDTH = 720;

/**
 * Grab a poster frame from the video (~0.5s in, past any black lead-in)
 * as a JPEG blob. Returns null when the browser can't decode/seek —
 * the Shot still posts, just without a thumbnail.
 */
function capturePoster(src: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = src;
    const bail = setTimeout(() => resolve(null), 8000);
    video.onerror = () => { clearTimeout(bail); resolve(null); };
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(0.5, Math.max(0, video.duration - 0.1));
    };
    video.onseeked = () => {
      clearTimeout(bail);
      const scale = Math.min(1, POSTER_WIDTH / (video.videoWidth || POSTER_WIDTH));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round((video.videoWidth || POSTER_WIDTH) * scale);
      canvas.height = Math.round((video.videoHeight || POSTER_WIDTH) * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(null); return; }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.82);
    };
  });
}

/**
 * Shot composer — Shots are short VIDEO reels (permanent, vertical feed).
 */
export function ShotComposer({ userId }: { userId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [postError, setPostError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [postedId, setPostedId] = useState<string | null>(null);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileError(null);
    if (!ALLOWED_TYPES.includes(f.type)) {
      setFileError("Shots are videos. Allowed: MP4, WebM, MOV.");
      return;
    }
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      setFileError(`Max size ${MAX_SIZE_MB}MB.`);
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  function removeFile() {
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function copyLink() {
    if (!postedId) return;
    const url = `${window.location.origin}/shots`;
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handlePost() {
    if (!file) return;
    setPostError(null);
    startTransition(async () => {
      const ext = file.name.split(".").pop() ?? "mp4";
      const path = `${userId}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("shot-media")
        .upload(path, file, { contentType: file.type, upsert: false });

      if (uploadErr) {
        setPostError("Upload failed: " + uploadErr.message);
        return;
      }
      const { data: pub } = supabase.storage.from("shot-media").getPublicUrl(path);

      // Poster frame → Discover tiles, profile grids and OG cards. Optional:
      // a failed capture never blocks the post itself.
      let posterUrl: string | null = null;
      if (preview) {
        const posterBlob = await capturePoster(preview);
        if (posterBlob) {
          const posterPath = `${userId}/${Date.now()}-poster.jpg`;
          const { error: posterErr } = await supabase.storage
            .from("shot-media")
            .upload(posterPath, posterBlob, { contentType: "image/jpeg", upsert: false });
          if (!posterErr) {
            posterUrl = supabase.storage.from("shot-media").getPublicUrl(posterPath).data.publicUrl;
          }
        }
      }

      const { data: shot, error: insertErr } = await supabase
        .from("shots")
        .insert({ user_id: userId, media_url: pub.publicUrl, caption: caption.trim() || null, poster_url: posterUrl })
        .select("id")
        .single();

      if (insertErr) {
        setPostError(insertErr.message);
        return;
      }
      setPostedId(shot.id);
    });
  }

  // ── Success state ──────────────────────────────────────────
  if (postedId) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 px-6 py-16 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent/20">
          <Send size={36} className="text-accent" />
        </div>
        <div>
          <h2 className="text-2xl font-extrabold">Shot posted!</h2>
          <p className="mt-1 text-sm text-muted">Your reel is live in the Shots feed.</p>
        </div>
        <button
          type="button"
          onClick={copyLink}
          className="flex h-12 w-full max-w-xs items-center justify-center gap-2 rounded-xl border border-border bg-surface text-sm font-semibold transition-colors hover:bg-elevated"
        >
          {copied ? (
            <>
              <Check size={16} className="text-accent" /> Link copied!
            </>
          ) : (
            <>
              <Link2 size={16} /> Copy Shots link
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            router.push("/shots");
            router.refresh();
          }}
          className="flex h-12 w-full max-w-xs items-center justify-center rounded-xl bg-accent text-sm font-bold text-accent-ink"
        >
          Watch Shots
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-8 pt-2">
      {/* Video picker */}
      <div
        className="relative flex min-h-[300px] cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-border bg-surface hover:border-accent/50"
        onClick={() => !preview && fileRef.current?.click()}
      >
        {preview ? (
          <>
            <video
              src={preview}
              className="max-h-[60vh] w-full bg-black object-contain"
              controls
              playsInline
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeFile();
              }}
              className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white"
            >
              <X size={16} />
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Video size={40} className="text-faint" />
            <p className="text-sm text-muted">Tap to choose a video</p>
            <p className="text-xs text-faint">MP4 · WebM · MOV · up to {MAX_SIZE_MB}MB</p>
          </div>
        )}
      </div>
      <input ref={fileRef} type="file" accept={ALLOWED_TYPES.join(",")} className="hidden" onChange={onFileChange} />
      {fileError && <p className="text-xs text-danger">{fileError}</p>}

      {/* Caption */}
      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value.slice(0, 150))}
        rows={2}
        placeholder="Add a caption… (optional)"
        className="input resize-none"
      />
      <p className="-mt-2 text-right text-xs text-faint">{caption.length}/150</p>

      {postError && <p className="rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">{postError}</p>}

      <button
        type="button"
        onClick={handlePost}
        disabled={!file || pending}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-accent text-base font-bold text-accent-ink transition-transform active:scale-[0.99] disabled:opacity-50"
      >
        {pending ? (
          <>
            <Loader2 size={18} className="animate-spin" /> Posting…
          </>
        ) : (
          <>
            <Send size={18} /> Post Shot
          </>
        )}
      </button>
    </div>
  );
}
