"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Check, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { StatusComposer, splitStatus, joinStatus, type StatusValue } from "@/components/ui/StatusComposer";
import { haptics } from "@/lib/haptics";

const MAX_LEN = 24;

/**
 * The user's current vibe (profiles.current_vibe) as a small pill.
 * On your own profile it's tappable and opens the picker sheet;
 * elsewhere it's read-only. Renders nothing when empty and not editable.
 */
export function VibePill({
  vibe,
  editable = false,
  userId,
}: {
  vibe: string | null;
  editable?: boolean;
  userId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(vibe);
  const [draft, setDraft] = useState<StatusValue>(() => splitStatus(vibe));
  const [saving, setSaving] = useState(false);

  function openSheet() {
    setDraft(splitStatus(current));
    setOpen(true);
  }

  async function save(value: string | null) {
    if (!userId || saving) return;
    setSaving(true);
    haptics.select();
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ current_vibe: value })
      .eq("id", userId);
    if (!error) {
      setCurrent(value);
      setOpen(false);
      router.refresh();
    }
    setSaving(false);
  }

  if (!current && !editable) return null;

  return (
    <>
      {current ? (
        <button
          type="button"
          disabled={!editable}
          onClick={() => editable && openSheet()}
          className={`mt-1.5 inline-flex max-w-full items-center gap-1 rounded-pill border border-border bg-surface px-2.5 py-1 text-xs font-semibold ${
            editable ? "transition-transform active:scale-95" : ""
          }`}
        >
          <span className="truncate">{current}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={openSheet}
          className="mt-1.5 inline-flex items-center gap-1 rounded-pill border border-dashed border-border px-2.5 py-1 text-xs font-semibold text-muted transition-colors hover:text-foreground"
        >
          <Plus size={12} /> Add a vibe
        </button>
      )}

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Your vibe">
        <div className="flex flex-col gap-4 pb-3">
          <StatusComposer value={draft} onChange={setDraft} maxTextLen={MAX_LEN} autoFocus={!current} />

          <button
            type="button"
            disabled={(!draft.text.trim() && !draft.emoji) || saving}
            onClick={() => save(joinStatus(draft))}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-sm font-bold text-accent-ink transition-transform active:scale-[0.99] disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            Set vibe
          </button>

          {current && (
            <button
              type="button"
              disabled={saving}
              onClick={() => save(null)}
              className="flex items-center justify-center gap-1.5 rounded-xl py-1 text-sm font-semibold text-muted transition-colors hover:text-danger"
            >
              <X size={15} /> Clear vibe
            </button>
          )}
        </div>
      </BottomSheet>
    </>
  );
}
