"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { MAX_COLLAB_TITLE, collabTitleReady, tidyCollabTitle } from "@/lib/show-collab";

/**
 * Start a shared Show.
 *
 * Only a name is asked for. Who else is in it is the next screen's
 * question, because an empty collab with a name is a thing you can
 * come back to, and a half-filled invite list is not.
 */
export function NewCollabButton() {
  const router = useRouter();
  const toast = useToast();
  const [supabase] = useState(createClient);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function make() {
    if (busy || !collabTitleReady(title)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("create_show_collab", {
      p_title: tidyCollabTitle(title),
    });
    setBusy(false);
    if (error || !data) {
      toast("Couldn't start that. Try again.");
      return;
    }
    setOpen(false);
    setTitle("");
    router.push(`/shows/collab/${data}`);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Start a shared Show"
        className="flex h-9 items-center gap-1 rounded-pill bg-elevated px-3 text-xs font-bold text-foreground active:scale-[0.98]"
      >
        <Users size={14} /> Shared
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Start a shared Show">
        <div className="space-y-3 px-4 pb-4">
          <label htmlFor="collab-title" className="sr-only">
            What to call it
          </label>
          <input
            id="collab-title"
            autoFocus
            value={title}
            maxLength={MAX_COLLAB_TITLE}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void make();
            }}
            placeholder="Goa trip"
            className="h-12 w-full rounded-xl bg-surface px-4 text-sm text-foreground outline-none placeholder:text-muted"
          />
          <button
            type="button"
            disabled={busy || !collabTitleReady(title)}
            onClick={() => void make()}
            className="h-12 w-full rounded-xl bg-accent text-sm font-extrabold text-accent-ink disabled:opacity-40"
          >
            {busy ? "Starting…" : "Start it"}
          </button>
          <p className="text-xs text-muted">
            One cover, everybody posting behind it. Ask people in once it exists.
          </p>
        </div>
      </BottomSheet>
    </>
  );
}
