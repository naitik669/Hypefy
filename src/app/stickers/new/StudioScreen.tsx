"use client";

import { useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { saveSticker, sendSticker } from "@/lib/sticker-store";
import { CutoutStudio, type StudioResult } from "@/components/stickers/CutoutStudio";

/**
 * Wires the studio to the sticker store. Every way out is a full navigation
 * (location.replace), never the router: this document is cross-origin
 * isolated, and a client-side route change would carry that isolation into
 * the rest of the app, where it blocks avatars and checkout. replace rather
 * than assign, so Back from the chat does not land in the studio again.
 */
export function StudioScreen({ userId, conversationId }: { userId: string; conversationId: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const back = conversationId ? `/messages/${conversationId}` : "/messages";

  // If a sticker saved but the send then failed, Send again reuses the
  // saved row rather than uploading a duplicate of the same picture. The
  // encoder is deterministic, so unchanged pixels give the same file size.
  const last = useRef<{ key: string; id: string } | null>(null);

  const save = async (r: StudioResult) => {
    const key = `${r.edge}:${r.w}x${r.h}:${r.blob.size}:${r.blob.type}`;
    if (last.current?.key === key) return { id: last.current.id };
    const saved = await saveSticker(supabase, userId, r.blob, r.edge, { width: r.w, height: r.h });
    if (!saved.ok) throw new Error(String(saved.error));
    last.current = { key, id: saved.value.id };
    return saved.value;
  };

  return (
    <CutoutStudio
      onClose={() => window.location.replace(back)}
      onSave={async (r) => {
        await save(r);
        window.location.replace(back);
      }}
      onSend={
        conversationId
          ? async (r) => {
              const sticker = await save(r);
              const sent = await sendSticker(supabase, conversationId, sticker.id);
              if (!sent.ok) throw new Error(String(sent.error));
              window.location.replace(back);
            }
          : undefined
      }
    />
  );
}
