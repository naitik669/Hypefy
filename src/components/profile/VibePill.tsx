"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Check, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { haptics } from "@/lib/haptics";

/** Curated starter vibes — one tap and you're feeling something. */
const PRESETS = [
  "🎧 locked in",
  "😴 low battery",
  "🔥 on one",
  "🧊 chillin",
  "💀 done today",
  "✨ main character",
  "🎮 grinding",
  "📚 studying",
  "🏃 outside",
  "🥱 bored",
  "❤️ soft hours",
  "🌙 up late",
];

const MAX_LEN = 28;

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
  const [custom, setCustom] = useState("");
  const [saving, setSaving] = useState(false);

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
      setCustom("");
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
          onClick={() => editable && setOpen(true)}
          className={`mt-1.5 inline-flex max-w-full items-center gap-1 rounded-pill border border-border bg-surface px-2.5 py-1 text-xs font-semibold ${
            editable ? "transition-transform active:scale-95" : ""
          }`}
        >
          <span className="truncate">{current}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-1.5 inline-flex items-center gap-1 rounded-pill border border-dashed border-border px-2.5 py-1 text-xs font-semibold text-muted transition-colors hover:text-foreground"
        >
          <Plus size={12} /> Add a vibe
        </button>
      )}

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Your vibe">
        <div className="flex flex-col gap-4 pb-3">
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                disabled={saving}
                onClick={() => save(p)}
                className={`truncate rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition-colors disabled:opacity-60 ${
                  current === p
                    ? "border-accent/40 bg-accent/[0.08] text-accent"
                    : "border-border bg-surface hover:bg-white/[0.04]"
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Custom vibe */}
          <div className="flex items-center gap-2">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value.slice(0, MAX_LEN))}
              placeholder="✍️ your own vibe…"
              className="input h-11 flex-1"
            />
            <button
              type="button"
              disabled={!custom.trim() || saving}
              onClick={() => save(custom.trim())}
              aria-label="Save vibe"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-ink disabled:opacity-50"
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            </button>
          </div>

          {current && (
            <button
              type="button"
              disabled={saving}
              onClick={() => save(null)}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-border py-2.5 text-sm font-semibold text-muted transition-colors hover:text-danger"
            >
              <X size={15} /> Clear vibe
            </button>
          )}
        </div>
      </BottomSheet>
    </>
  );
}
