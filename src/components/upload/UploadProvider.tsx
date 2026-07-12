"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";
import type { Track } from "@/lib/music";

type PostUpload = {
  userId: string;
  files: File[];
  caption: string | null;
  body: string | null;
  hashtags: string[];
  mentions: string[];
  track?: Track | null;
  poll?: { options: string[] } | null;
};

type Ctx = {
  progress: number | null;
  /** The last upload that failed — kept so the user can retry it. */
  failed: PostUpload | null;
  uploadPost: (a: PostUpload) => void;
  retryUpload: () => void;
  dismissFailed: () => void;
};
const UploadCtx = createContext<Ctx>({
  progress: null,
  failed: null,
  uploadPost: () => {},
  retryUpload: () => {},
  dismissFailed: () => {},
});
export const useUpload = () => useContext(UploadCtx);

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const router = useRouter();
  const toast = useToast();
  const [progress, setProgress] = useState<number | null>(null);
  const [failed, setFailed] = useState<PostUpload | null>(null);
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

      const { error: insErr } = await supabase.from("posts").insert({
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
      });
      if (insErr) throw insErr;

      stopTrickle();
      setProgress(100);
      toast("Post shared", "success");
      router.refresh();
      setTimeout(() => setProgress(null), 700);
    } catch {
      stopTrickle();
      setProgress(null);
      // Stash the payload (Files still valid) so the user can one-tap retry.
      setFailed(a);
      toast("Couldn't share your post", "error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, router, toast]);

  const retryUpload = useCallback(() => {
    if (failed) uploadPost(failed);
  }, [failed, uploadPost]);

  const dismissFailed = useCallback(() => setFailed(null), []);

  return (
    <UploadCtx.Provider value={{ progress, failed, uploadPost, retryUpload, dismissFailed }}>
      {children}
    </UploadCtx.Provider>
  );
}

/**
 * Upload status — rendered on Home beneath the Shows row. Shows the thin
 * progress line while uploading, or a retry banner when the last upload failed.
 */
export function UploadProgressBar() {
  const { progress, failed, retryUpload, dismissFailed } = useUpload();

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
