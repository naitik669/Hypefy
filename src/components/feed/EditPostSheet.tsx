"use client";

import { useState, useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BottomSheet } from "@/components/ui/BottomSheet";

export function EditPostSheet({
  open,
  onClose,
  postId,
  initialCaption,
  initialBody,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  postId: string;
  initialCaption: string | null;
  initialBody: string | null;
  onSaved: (caption: string, body: string) => void;
}) {
  const supabase = createClient();
  const [caption, setCaption] = useState(initialCaption ?? "");
  const [body, setBody] = useState(initialBody ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const { error: err } = await supabase
        .from("posts")
        .update({ caption: caption.trim() || null, body: body.trim() || null })
        .eq("id", postId);
      if (err) { setError(err.message); return; }
      onSaved(caption.trim(), body.trim());
      onClose();
    });
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Edit post">
      <div className="flex flex-col gap-3 pb-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">Caption</label>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value.slice(0, 300))}
            rows={3}
            placeholder="Write a caption…"
            className="input w-full resize-none"
          />
          <p className="mt-0.5 text-right text-[11px] text-faint">{caption.length}/300</p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">Body (optional)</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, 1000))}
            rows={4}
            placeholder="Add more thoughts…"
            className="input w-full resize-none"
          />
          <p className="mt-0.5 text-right text-[11px] text-faint">{body.length}/1000</p>
        </div>
        {error && (
          <p className="rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>
        )}
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="flex h-12 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-bold text-accent-ink disabled:opacity-60"
        >
          {pending ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : <><Save size={16} /> Save changes</>}
        </button>
      </div>
    </BottomSheet>
  );
}
