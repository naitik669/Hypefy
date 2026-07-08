"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";

type PostUpload = {
  userId: string;
  files: File[];
  caption: string | null;
  body: string | null;
  hashtags: string[];
  mentions: string[];
};

type Ctx = { progress: number | null; uploadPost: (a: PostUpload) => void };
const UploadCtx = createContext<Ctx>({ progress: null, uploadPost: () => {} });
export const useUpload = () => useContext(UploadCtx);

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const router = useRouter();
  const toast = useToast();
  const [progress, setProgress] = useState<number | null>(null);
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
        image_urls: urls.length ? urls : null,
        hashtags: a.hashtags,
        mentions: a.mentions,
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
      toast("Couldn't share your post", "error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, router, toast]);

  return (
    <UploadCtx.Provider value={{ progress, uploadPost }}>
      {children}
    </UploadCtx.Provider>
  );
}

/** Thin upload progress line — rendered on Home beneath the Shows row. */
export function UploadProgressBar() {
  const { progress } = useUpload();
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
