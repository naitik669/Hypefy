"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Check, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CenterModal } from "@/components/ui/CenterModal";
import { Avatar } from "@/components/ui/Avatar";
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
  name,
  hue = 280,
  avatarUrl = null,
}: {
  vibe: string | null;
  editable?: boolean;
  userId?: string;
  name?: string;
  hue?: number;
  avatarUrl?: string | null;
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

      <CenterModal open={open} onClose={() => setOpen(false)} title="Your vibe">
        <div className="flex flex-col gap-4">
          {/* Live preview — the pill exactly as it sits on your profile */}
          <div className="flex items-center gap-3 rounded-3xl bg-surface/60 px-4 py-4">
            <Avatar name={name ?? "You"} hue={hue} size={44} src={avatarUrl ?? undefined} />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold leading-tight">{name ?? "You"}</p>
              <span
                className={`mt-1 inline-flex max-w-full items-center rounded-pill border border-border bg-elevated px-2.5 py-1 text-xs font-semibold ${
                  joinStatus(draft) ? "" : "text-faint"
                }`}
              >
                <span className="truncate">{joinStatus(draft) || "your vibe here…"}</span>
              </span>
            </div>
          </div>

          <StatusComposer value={draft} onChange={setDraft} maxTextLen={MAX_LEN} autoFocus={!current} />

          <div className="flex flex-col gap-1">
            <button
              type="button"
              disabled={(!draft.text.trim() && !draft.emoji) || saving}
              onClick={() => save(joinStatus(draft))}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-sm font-bold text-accent-ink transition-transform active:scale-[0.99] disabled:opacity-40"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              Set vibe
            </button>
            {current && (
              <button
                type="button"
                disabled={saving}
                onClick={() => save(null)}
                className="flex items-center justify-center gap-1.5 py-2 text-[13px] font-semibold text-muted transition-colors hover:text-danger"
              >
                <X size={14} /> Clear vibe
              </button>
            )}
          </div>
        </div>
      </CenterModal>
    </>
  );
}
