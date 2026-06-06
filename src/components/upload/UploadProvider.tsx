"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

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
  const [progress, setProgress] = useState<number | null>(null);
  const [toast, setToast] = useState<{ kind: "success" | "error"; msg: string } | null>(null);
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
      setToast({ kind: "success", msg: "Post shared" });
      router.refresh();
      setTimeout(() => setProgress(null), 700);
      setTimeout(() => setToast(null), 2600);
    } catch {
      stopTrickle();
      setProgress(null);
      setToast({ kind: "error", msg: "Couldn't share your post" });
      setTimeout(() => setToast(null), 3200);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, router]);

  return (
    <UploadCtx.Provider value={{ progress, uploadPost }}>
      {children}
      {toast && (
        <div className="fixed bottom-24 left-1/2 z-[210] flex -translate-x-1/2 items-center gap-2 rounded-pill bg-elevated px-4 py-2.5 text-sm font-semibold shadow-lg ring-1 ring-border">
          {toast.kind === "success"
            ? <Check size={16} className="text-accent" />
            : <AlertCircle size={16} className="text-danger" />}
          {toast.msg}
        </div>
      )}
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
        style={{ width: `${progress}%`, boxShadow: "0 0 8px rgba(200,255,0,0.6)" }}
      />
    </div>
  );
}
