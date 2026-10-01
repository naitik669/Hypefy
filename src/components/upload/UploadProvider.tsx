"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";
import type { Track } from "@/lib/music";
import { capturePoster } from "@/lib/video-poster";
import { trimToStore, type Trim } from "@/lib/shot-trim";
import { uploadContentType } from "@/lib/video-mime";

type PostUpload = {
  userId: string;
  files: File[];
  caption: string | null;
  body: string | null;
  hashtags: string[];
  mentions: string[];
  track?: Track | null;
  poll?: { options: string[] } | null;
  /** width / height the post was composed at; null for text-only posts. The
   *  feed frames the gallery with it instead of forcing every post square. */
  aspectRatio?: number | null;
  /** ISO timestamp to publish later — routes the post to scheduled_posts. */
  scheduledAt?: string | null;
};

type ShotUpload = {
  userId: string;
  file: File;
  caption: string | null;
  hashtags: string[];
  mentions: string[];
  track?: Track | null;
  /** Which frame becomes the poster, in seconds. Null takes the default. */
  coverTime: number | null;
  /** The clip's length and the window that plays. */
  duration: number;
  trim: Trim;
};

/** What failed, and enough of it to try again. */
type Failed =
  | { kind: "post"; post: PostUpload }
  | { kind: "shot"; shot: ShotUpload };

type Ctx = {
  progress: number | null;
  /** What is in flight, so each surface only shows its own kind. */
  active: "post" | "shot" | null;
  /** The last upload that failed — kept so the user can retry it. */
  failed: Failed | null;
  uploadPost: (a: PostUpload) => void;
  uploadShot: (a: ShotUpload) => void;
  retryUpload: () => void;
  dismissFailed: () => void;
};
const UploadCtx = createContext<Ctx>({
  progress: null,
  active: null,
  failed: null,
  uploadPost: () => {},
  uploadShot: () => {},
  retryUpload: () => {},
  dismissFailed: () => {},
});
export const useUpload = () => useContext(UploadCtx);

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const router = useRouter();
  const toast = useToast();
  const [progress, setProgress] = useState<number | null>(null);
  const [active, setActive] = useState<"post" | "shot" | null>(null);
  const [failed, setFailed] = useState<Failed | null>(null);
  const trickle = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTrickle = () => { if (trickle.current) { clearInterval(trickle.current); trickle.current = null; } };
  const startTrickle = () => {
    stopTrickle();
    // Storage uploads don't expose byte progress, so creep toward 90% so the
    // bar always feels alive; real milestones jump it forward.
    trickle.current = setInterval(() => {
      setProgress((p) => (p == null || p >= 90 ? p : p + Math.max(0.4, (92 - p) * 0.03)));
    }, 220);
  };

  const uploadPost = useCallback(async (a: PostUpload) => {
    setActive("post");
    setProgress(6);
    setFailed(null);
    startTrickle();
    try {
      const urls: string[] = [];
      for (let i = 0; i < a.files.length; i++) {
        const path = `${a.userId}/${Date.now()}-${i}.jpg`;
        const { error } = await supabase.storage
          .from("post-images")
          .upload(path, a.files[i], { contentType: "image/jpeg", upsert: false });
        if (error) throw error;
        urls.push(supabase.storage.from("post-images").getPublicUrl(path).data.publicUrl);
        setProgress(Math.min(85, 10 + ((i + 1) / a.files.length) * 72));
      }

      const record = {
        user_id: a.userId,
        caption: a.caption,
        body: a.body,
        image_url: urls[0] ?? null,
        // NOT NULL column with a [] default — sending null breaks text-only posts.
        image_urls: urls,
        hashtags: a.hashtags,
        mentions: a.mentions,
        track: a.track ?? null,
        poll: a.poll ?? null,
        aspect_ratio: a.aspectRatio ?? null,
      };

      // Scheduled → its own table (a pg_cron job publishes it when due); the
      // feed queries never see it, so nothing else changes.
      const { error: insErr } = a.scheduledAt
        ? await supabase.from("scheduled_posts").insert({ ...record, scheduled_at: a.scheduledAt })
        : await supabase.from("posts").insert(record);
      if (insErr) throw insErr;

      stopTrickle();
      setProgress(100);
      toast(a.scheduledAt ? "Post scheduled" : "Post shared", "success");
      router.refresh();
      setTimeout(() => setProgress(null), 700);
    } catch {
      stopTrickle();
      setProgress(null);
      // Stash the payload (Files still valid) so the user can one-tap retry.
      setFailed({ kind: "post", post: a });
      toast("Couldn't share your post", "error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, router, toast]);

  /**
   * A Shot, uploaded after you have already left the composer.
   *
   * Publishing used to hold you on a spinner for the whole file — up to 50 MB
   * on a phone — with a failure that dropped the clip entirely. This returns
   * you to the feed at once and keeps the File, so a failure is a banner with
   * a Retry rather than lost work.
   */
  const uploadShot = useCallback(async (a: ShotUpload) => {
    setActive("shot");
    setProgress(6);
    setFailed(null);
    startTrickle();
    // Its own object URL: the composer that made one has already unmounted
    // and revoked it by the time the poster is captured.
    const localUrl = URL.createObjectURL(a.file);
    try {
      // The poster comes FIRST, before the long upload. It is drawn by
      // decoding the clip in a hidden <video>, and a backgrounded WebView
      // does not decode: capturing afterwards meant that putting the phone
      // down during a 50 MB upload — which is exactly what people do — gave
      // a Shot with no thumbnail. Nothing is sent yet, so it costs only the
      // moment it takes.
      const poster = await capturePoster(localUrl, a.coverTime);

      const ext = a.file.name.split(".").pop() || "webm";
      const path = `${a.userId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("shot-media")
        .upload(path, a.file, { contentType: uploadContentType(a.file), upsert: false });
      if (upErr) throw upErr;
      setProgress(80);
      const mediaUrl = supabase.storage.from("shot-media").getPublicUrl(path).data.publicUrl;

      // Best effort: a Shot with no poster still plays, so a failure here
      // must not cost the upload that has already succeeded.
      let posterUrl: string | null = null;
      if (poster) {
        const posterPath = `${a.userId}/${Date.now()}-poster.jpg`;
        const { error: pErr } = await supabase.storage
          .from("shot-media")
          .upload(posterPath, poster, { contentType: "image/jpeg" });
        if (!pErr) {
          posterUrl = supabase.storage.from("shot-media").getPublicUrl(posterPath).data.publicUrl;
        }
      }

      const { error: insErr } = await supabase.from("shots").insert({
        user_id: a.userId,
        media_url: mediaUrl,
        caption: a.caption,
        poster_url: posterUrl,
        track: a.track ?? null,
        hashtags: a.hashtags,
        mentions: a.mentions,
        duration_secs: a.duration > 0 ? Number(a.duration.toFixed(3)) : null,
        ...trimToStore(a.trim, a.duration),
      });
      if (insErr) throw insErr;

      stopTrickle();
      setProgress(100);
      toast("Shot posted", "success");
      router.refresh();
      setTimeout(() => setProgress(null), 700);
    } catch {
      stopTrickle();
      setProgress(null);
      setFailed({ kind: "shot", shot: a });
      toast("Couldn't post your Shot", "error");
    } finally {
      URL.revokeObjectURL(localUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, router, toast]);

  const retryUpload = useCallback(() => {
    if (!failed) return;
    if (failed.kind === "post") uploadPost(failed.post);
    else uploadShot(failed.shot);
  }, [failed, uploadPost, uploadShot]);

  const dismissFailed = useCallback(() => setFailed(null), []);

  return (
    <UploadCtx.Provider value={{ progress, active, failed, uploadPost, uploadShot, retryUpload, dismissFailed }}>
      {children}
    </UploadCtx.Provider>
  );
}

/**
 * Upload status — rendered on Home beneath the Shows row. Shows the thin
 * progress line while uploading, or a retry banner when the last upload failed.
 */
export function UploadProgressBar() {
  const { progress, active, failed, retryUpload, dismissFailed } = useUpload();

  if (active === "shot" || failed?.kind === "shot") return null;

  if (progress == null && failed) {
    return (
      <div className="flex items-center gap-3 border-b border-border/60 bg-danger/10 px-4 py-2.5">
        <p className="min-w-0 flex-1 text-sm font-medium text-foreground">
          Couldn&apos;t share your post.
        </p>
        <button
          type="button"
          onClick={retryUpload}
          className="shrink-0 rounded-pill bg-accent px-3.5 py-1.5 text-xs font-bold text-accent-ink transition-transform active:scale-95"
        >
          Retry
        </button>
        <button
          type="button"
          onClick={dismissFailed}
          aria-label="Dismiss"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground"
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  if (progress == null) return null;
  return (
    <div className="h-0.5 w-full bg-border/40">
      <div
        className="h-full bg-accent transition-[width] duration-300 ease-out"
        style={{ width: `${progress}%`, boxShadow: "0 0 8px rgba(163,230,53,0.6)" }}
      />
    </div>
  );
}

/**
 * A Shot on its way up, from wherever you are.
 *
 * Posting a Shot lands you on /shots, where Home's inline bar is not
 * rendered — and the Shots feed is a fixed, full-screen surface with nothing
 * to slot a bar into. So this floats above the tab bar instead, and is the
 * only place a Shot upload reports itself. It is deliberately not the same
 * component as the post bar: the two live on different screens and neither
 * ever shows the other's kind.
 */
export function ShotUploadCard() {
  const { progress, active, failed, retryUpload, dismissFailed } = useUpload();

  const isShotFailure = failed?.kind === "shot";
  if (!isShotFailure && active !== "shot") return null;
  if (progress == null && !isShotFailure) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(72px+var(--sab))] z-[120] flex justify-center px-3">
      <div className="pointer-events-auto flex w-full max-w-[420px] items-center gap-3 rounded-2xl border border-border bg-elevated/95 px-4 py-3 shadow-lg backdrop-blur-xl">
        {isShotFailure ? (
          <>
            <p className="min-w-0 flex-1 text-sm font-semibold">Couldn&apos;t post your Shot.</p>
            <button
              type="button"
              onClick={retryUpload}
              className="shrink-0 rounded-pill bg-accent px-3.5 py-1.5 text-xs font-bold text-accent-ink transition-transform active:scale-95"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={dismissFailed}
              aria-label="Dismiss"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground"
            >
              <X size={16} />
            </button>
          </>
        ) : (
          <>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Posting your Shot…</span>
              <span className="mt-1.5 block h-1 w-full overflow-hidden rounded-pill bg-border/60">
                <span
                  className="block h-full rounded-pill bg-accent transition-[width] duration-300 ease-out"
                  style={{ width: `${progress ?? 0}%` }}
                />
              </span>
            </span>
            <span className="shrink-0 text-xs font-bold tabular-nums text-muted">
              {Math.round(progress ?? 0)}%
            </span>
          </>
        )}
      </div>
    </div>
  );
}
