"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useToast } from "@/components/ui/ToastProvider";
import { FolderArt } from "@/components/saved/FolderArt";
import { haptics } from "@/lib/haptics";
import { cleanFolderName, FOLDER_EMOJI, folderFill, makeFolder, nextFolderColor, toFolder, type Folder } from "@/lib/folders";

/** One post or one Shot. */
export type SavedTarget = { post: string; shot?: never } | { shot: string; post?: never };

/**
 * Which folders a post or Shot is in — opened by holding its bookmark.
 *
 * Every tick applies straight away (set_item_folders files it in exactly the
 * ticked folders), so there is no Done to forget. Filing something saves it,
 * which the card is told through `onSaved` so its bookmark fills in. Calls go
 * one after another, so quick ticks land in the order they were made.
 */
export function FolderSheet({
  open,
  onClose,
  target,
  userId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  target: SavedTarget;
  userId: string;
  onSaved?: () => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Save to">
      {/* Mounted only while open, so each opening starts clean and reads
          the folders as they are now. */}
      {open && <FolderList target={target} userId={userId} onSaved={onSaved} />}
    </BottomSheet>
  );
}

function FolderList({ target, userId, onSaved }: { target: SavedTarget; userId: string; onSaved?: () => void }) {
  const supabase = createClient();
  const toast = useToast();
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [inside, setInside] = useState<Set<string>>(new Set());
  const [making, setMaking] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const post = target.post ?? null;
  const shot = target.shot ?? null;

  useEffect(() => {
    let gone = false;
    (async () => {
      const [list, mine] = await Promise.all([
        supabase.rpc("get_folders"),
        post
          ? supabase.from("collection_items").select("collection_id").eq("post_id", post)
          : supabase.from("collection_items").select("collection_id").eq("shot_id", shot!),
      ]);
      if (gone) return;
      const all = (list.data ?? []).map(toFolder);
      setFolders(all);
      setInside(new Set((mine.data ?? []).map((r) => r.collection_id)));
      setMaking(all.length === 0);
    })();
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post, shot]);

  /** File it in exactly `next`, after anything still on its way. */
  function apply(next: Set<string>, before: Set<string>) {
    setInside(next);
    if (next.size > 0) onSaved?.();
    queue.current = queue.current.then(async () => {
      const { error } = await supabase.rpc("set_item_folders", {
        ...(post ? { p_post: post } : { p_shot: shot! }),
        p_folders: [...next],
      });
      if (error) {
        setInside(before);
        toast("Couldn't update folders", "error");
      }
    });
    return queue.current;
  }

  function toggle(f: Folder) {
    haptics.select();
    const next = new Set(inside);
    const leaving = next.has(f.id);
    if (leaving) next.delete(f.id);
    else next.add(f.id);
    setFolders((all) => all?.map((x) => (x.id === f.id ? { ...x, itemCount: Math.max(0, x.itemCount + (leaving ? -1 : 1)) } : x)) ?? all);
    void apply(next, inside);
  }

  async function create() {
    const clean = cleanFolderName(name);
    if (!clean || creating) return;
    setCreating(true);
    const list = folders ?? [];
    const made = await makeFolder(supabase, userId, { name: clean, emoji, color: nextFolderColor(list.length) }, list);
    setCreating(false);
    if (!made) {
      toast("Couldn't make that folder", "error");
      return;
    }
    haptics.select();
    // Made to hold this one thing, so it goes straight in.
    setFolders([...list, { ...made, itemCount: 1 }]);
    setMaking(false);
    setName("");
    setEmoji(null);
    void apply(new Set(inside).add(made.id), inside);
  }

  return (
    <>
      {folders === null ? (
        <div className="flex justify-center py-10">
          <Loader2 size={20} className="animate-spin text-muted" />
        </div>
      ) : (
        <div className="flex flex-col pb-2">
          {folders.map((f) => {
            const on = inside.has(f.id);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => toggle(f)}
                aria-pressed={on}
                className="-mx-2 flex items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors active:bg-white/5"
              >
                <FolderArt folder={f} variant="chip" className="w-12 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold">
                    {f.emoji && <span className="mr-1.5">{f.emoji}</span>}
                    {f.name}
                  </span>
                  <span className="block text-xs tabular-nums text-muted">{f.itemCount}</span>
                </span>
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors ${
                    on ? "bg-accent text-accent-ink" : "ring-2 ring-inset ring-border"
                  }`}
                >
                  {on && <Check size={14} strokeWidth={3} />}
                </span>
              </button>
            );
          })}

          {making ? (
            <form
              className="mt-2 flex flex-col gap-3 rounded-2xl bg-surface p-3"
              onSubmit={(e) => {
                e.preventDefault();
                void create();
              }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] text-2xl"
                  style={{ background: folderFill(nextFolderColor(folders.length)).background }}
                >
                  {emoji ?? <Plus size={20} className="text-white/80" />}
                </span>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 40))}
                  placeholder="Folder name"
                  aria-label="Folder name"
                  className="min-w-0 flex-1 bg-transparent text-[15px] font-bold outline-none placeholder:font-semibold placeholder:text-faint"
                />
                <button
                  type="submit"
                  disabled={!cleanFolderName(name) || creating}
                  className="flex h-9 shrink-0 items-center rounded-pill bg-accent px-4 text-xs font-bold text-accent-ink disabled:opacity-40"
                >
                  {creating ? <Loader2 size={14} className="animate-spin" /> : "Create"}
                </button>
              </div>
              <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1">
                {FOLDER_EMOJI.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setEmoji(emoji === e ? null : e)}
                    aria-label={`Emoji ${e}`}
                    aria-pressed={emoji === e}
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg transition-colors ${
                      emoji === e ? "bg-white/15 ring-2 ring-accent" : "hover:bg-white/5"
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setMaking(true)}
              className="-mx-2 flex items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors active:bg-white/5"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] border-2 border-dashed border-border text-muted">
                <Plus size={20} />
              </span>
              <span className="text-[15px] font-bold">New folder</span>
            </button>
          )}
        </div>
      )}
    </>
  );
}
