"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { FolderArt } from "@/components/saved/FolderArt";
import { useToast } from "@/components/ui/ToastProvider";
import { haptics } from "@/lib/haptics";
import { toFolder, type Folder } from "@/lib/folders";
import { playlistsHolding, setSoundPlaylists, sharedLine } from "@/lib/playlists";
import type { Track } from "@/lib/music";

/**
 * Which playlists a sound is in.
 *
 * Tick the ones it should be in and press Done: it is put in exactly those
 * (yours, and shared ones you joined), and kept in your Library either way.
 * Making a new playlist is done from the Library; this only files.
 */
export function SoundPlaylistSheet({
  open,
  onClose,
  track,
}: {
  open: boolean;
  /** `changed` when the sound's playlists were updated. */
  onClose: (changed: boolean) => void;
  track: Track;
}) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [playlists, setPlaylists] = useState<Folder[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let live = true;
    void Promise.all([supabase.rpc("get_folders"), playlistsHolding(supabase, track.id)]).then(([folders, holding]) => {
      if (!live) return;
      const list = ((folders.data ?? []) as Parameters<typeof toFolder>[0][]).map(toFolder);
      setPlaylists(list);
      setPicked(new Set(list.filter((f) => holding.has(f.id)).map((f) => f.id)));
    });
    return () => {
      live = false;
    };
  }, [open, supabase, track.id]);

  function toggle(id: string) {
    haptics.select();
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function done() {
    if (saving) return;
    setSaving(true);
    const ok = await setSoundPlaylists(supabase, track, [...picked]);
    setSaving(false);
    if (!ok) {
      toast("Couldn't update playlists", "error");
      return;
    }
    toast(picked.size ? `In ${picked.size} ${picked.size === 1 ? "playlist" : "playlists"}` : "Taken out of your playlists", "success");
    onClose(true);
  }

  return (
    <BottomSheet
      open={open}
      onClose={() => onClose(false)}
      title="Add to a playlist"
      footer={
        <button
          type="button"
          onClick={() => void done()}
          disabled={saving || playlists === null}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-sm font-extrabold text-accent-ink disabled:opacity-60"
        >
          {saving && <Loader2 size={16} className="animate-spin" />}
          Done
        </button>
      }
    >
      {playlists === null ? (
        <div className="flex justify-center py-10">
          <Loader2 size={20} className="animate-spin text-muted" />
        </div>
      ) : playlists.length === 0 ? (
        <p className="px-6 py-10 text-center text-sm text-muted">
          You have no playlists yet. Make one in your Library with the <Plus size={13} className="inline" /> button.
        </p>
      ) : (
        <div className="flex flex-col pb-2">
          {playlists.map((f) => {
            const on = picked.has(f.id);
            const shared = sharedLine(f);
            return (
              <button
                key={f.id}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(f.id)}
                className="flex items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/5"
              >
                <FolderArt folder={f} className="w-11 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{f.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {f.itemCount} {f.itemCount === 1 ? "item" : "items"}
                    {shared ? ` · ${shared}` : ""}
                  </span>
                </span>
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                    on ? "border-accent bg-accent text-accent-ink" : "border-border"
                  }`}
                >
                  {on && <Check size={14} strokeWidth={3} />}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </BottomSheet>
  );
}
