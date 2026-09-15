"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, FolderInput, FolderMinus, ImageIcon, Pencil, Plus, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { safeBack } from "@/lib/safe-back";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/ToastProvider";
import { FolderArt } from "@/components/saved/FolderArt";
import { SavedGrid } from "@/components/saved/SavedGrid";
import { FolderEditor, type FolderDraft } from "@/components/saved/FolderEditor";
import { FolderPickSheet } from "@/components/saved/FolderPickSheet";
import { FolderAddPicker } from "@/components/saved/FolderAddPicker";
import { scheduleUndoable } from "@/lib/undoable";
import { haptics } from "@/lib/haptics";
import { folderFill, makeFolder, nextFolderColor, toFolder, type Folder } from "@/lib/folders";
import { FOLDER_ITEM_COLS, folderItem, itemKey, type SavedItem } from "@/lib/saved";

const HEADER = "sticky top-0 z-20 flex h-[calc(3.5rem+var(--sat))] items-center gap-1 px-2 pt-[var(--sat)] transition-colors";
const ICON_BTN = "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-white/5";
const GLOW = "radial-gradient(75% 70% at 50% 0%, #000 10%, transparent 72%)";
const PILL = "flex h-9 items-center gap-1.5 rounded-pill bg-elevated px-3 text-xs font-bold ring-1 ring-border transition-colors active:bg-white/10 disabled:opacity-40";

/**
 * One folder: its tile large, lit from above in its own colour, then
 * everything in it, newest in first.
 *
 * Add fills it from what you have saved; Edit changes its name, emoji and
 * colour, or deletes it (what was in it stays saved). Hold anything to
 * select: one picture can be made the cover, and any number can be moved to
 * another folder or taken out (with Undo).
 */
export function FolderScreen({
  userId,
  initialFolder,
  initialItems,
}: {
  userId: string;
  initialFolder: Folder;
  initialItems: SavedItem[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const toast = useToast();

  const [folder, setFolder] = useState(initialFolder);
  const [items, setItems] = useState(initialItems);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Map<string, SavedItem>>(new Map());
  const selecting = selected.size > 0;

  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState(false);
  const [making, setMaking] = useState(false);
  const [others, setOthers] = useState<Folder[]>([]);

  const shown = items.filter((i) => !hidden.has(itemKey(i)));
  const fill = folderFill(folder.color, folder.id);
  const art = { ...folder, covers: shown.slice(0, 4).map((i) => ({ kind: i.kind, thumb: i.thumb, video: i.video })) };
  const only = selected.size === 1 ? [...selected.values()][0] : null;
  const isCover = !!only?.thumb && only.thumb === folder.coverUrl;

  async function reload() {
    const { data } = await supabase
      .from("collection_items")
      .select(FOLDER_ITEM_COLS)
      .eq("collection_id", folder.id)
      .order("created_at", { ascending: false })
      .limit(500);
    if (data) setItems((data as unknown as Record<string, unknown>[]).flatMap((r) => folderItem(r) ?? []));
  }

  function toggle(item: SavedItem) {
    haptics.select();
    setSelected((prev) => {
      const next = new Map(prev);
      const k = itemKey(item);
      if (next.has(k)) next.delete(k);
      else next.set(k, item);
      return next;
    });
  }

  const split = (list: SavedItem[]) => ({
    p_posts: list.filter((i) => i.kind === "post").map((i) => i.id),
    p_shots: list.filter((i) => i.kind === "shot").map((i) => i.id),
  });

  // ── Edit ──────────────────────────────────────────────────────────────
  async function save(draft: FolderDraft) {
    const { error } = await supabase
      .from("collections")
      .update({ name: draft.name, emoji: draft.emoji, color: draft.color })
      .eq("id", folder.id);
    if (error) {
      toast("Couldn't save that", "error");
      return false;
    }
    setFolder({ ...folder, ...draft });
    return true;
  }

  async function remove() {
    const { data, error } = await supabase.from("collections").delete().eq("id", folder.id).select("id");
    setDeleting(false);
    // .select() so a refusal (no rows, no error) is not read as done.
    if (error || !data?.length) {
      toast("Couldn't delete that folder", "error");
      return;
    }
    toast(`Deleted ${folder.name}`);
    router.replace("/saved");
  }

  // ── Selection ─────────────────────────────────────────────────────────
  async function setCover() {
    if (!only?.thumb) return;
    const cover = isCover ? null : only.thumb;
    const { error } = await supabase.from("collections").update({ cover_url: cover }).eq("id", folder.id);
    if (error) {
      toast("Couldn't change the cover", "error");
      return;
    }
    haptics.success();
    setFolder({ ...folder, coverUrl: cover });
    setSelected(new Map());
    toast(cover ? "Cover set" : "Cover cleared");
  }

  function takeOut(list: SavedItem[]) {
    const keys = list.map(itemKey);
    setHidden((prev) => new Set([...prev, ...keys]));
    setSelected(new Map());
    const { p_posts, p_shots } = split(list);
    const unhide = () => setHidden((prev) => new Set([...prev].filter((k) => !keys.includes(k))));
    const cancel = scheduleUndoable(async () => {
      const [a, b] = await Promise.all([
        p_posts.length ? supabase.from("collection_items").delete().eq("collection_id", folder.id).in("post_id", p_posts) : { error: null },
        p_shots.length ? supabase.from("collection_items").delete().eq("collection_id", folder.id).in("shot_id", p_shots) : { error: null },
      ]);
      if (a.error || b.error) {
        unhide();
        toast("Couldn't take those out", "error");
        return;
      }
      setItems((all) => all.filter((i) => !keys.includes(itemKey(i))));
      unhide();
    });
    toast(list.length === 1 ? "Taken out" : `Took out ${list.length}`, "plain", {
      label: "Undo",
      onClick: () => {
        cancel();
        unhide();
      },
    });
  }

  async function openMove() {
    const { data } = await supabase.rpc("get_folders");
    setOthers((data ?? []).map(toFolder));
    setMoving(true);
  }

  async function moveTo(target: Folder, list: SavedItem[]) {
    setMoving(false);
    const { error } = await supabase.rpc("file_items", { p_folder: target.id, ...split(list), p_from: folder.id });
    if (error) {
      toast("Couldn't move those", "error");
      return;
    }
    haptics.success();
    const keys = new Set(list.map(itemKey));
    setItems((all) => all.filter((i) => !keys.has(itemKey(i))));
    setSelected(new Map());
    toast(`Moved to ${target.name}`, "success");
  }

  async function makeAndMove(draft: FolderDraft) {
    const made = await makeFolder(supabase, userId, draft, others);
    if (!made) {
      toast("Couldn't make that folder", "error");
      return false;
    }
    void moveTo(made, [...selected.values()]);
    return true;
  }

  return (
    <div className="relative flex min-h-full flex-col pb-10">
      {/* Light from above, in the folder's colour — a touch, like Spotlight's. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-60"
        style={{ background: fill.background, maskImage: GLOW, WebkitMaskImage: GLOW }}
      />

      {selecting ? (
        <header className={`${HEADER} border-b border-border/60 bg-background/90 backdrop-blur-xl`}>
          <button type="button" onClick={() => setSelected(new Map())} aria-label="Stop selecting" className={ICON_BTN}>
            <X size={22} />
          </button>
          <h1 className="flex-1 truncate px-1 text-[17px] font-extrabold tabular-nums tracking-tight">{selected.size} selected</h1>
          {/* Makes the one picture chosen the folder's cover; pressed when it
              already is, and pressing it then goes back to the newest. */}
          <button
            type="button"
            onClick={() => void setCover()}
            disabled={!only?.thumb}
            aria-pressed={isCover}
            aria-label={isCover ? "Stop using as cover" : "Use as cover"}
            className={`${PILL} ${isCover ? "text-accent ring-accent/60" : ""}`}
          >
            <ImageIcon size={15} />
          </button>
          <button type="button" onClick={() => void openMove()} className={PILL}>
            <FolderInput size={15} /> Move
          </button>
          <button
            type="button"
            onClick={() => takeOut([...selected.values()])}
            aria-label="Take out of folder"
            className={`${PILL} mr-1 text-danger`}
          >
            <FolderMinus size={15} />
          </button>
        </header>
      ) : (
        // No bar: the buttons float on the folder's light, and carry their
        // own backing so they still read over the grid scrolling under them.
        <header className={HEADER}>
          <button type="button" onClick={() => safeBack(router)} aria-label="Back" className={`${ICON_BTN} bg-black/25 backdrop-blur-md`}>
            <ChevronLeft size={24} />
          </button>
          <span className="flex-1" />
          <button type="button" onClick={() => setEditing(true)} aria-label="Edit folder" className={`${ICON_BTN} bg-black/25 backdrop-blur-md`}>
            <Pencil size={18} />
          </button>
        </header>
      )}

      <section className="relative flex flex-col items-center px-6 pb-6 pt-2 text-center">
        <FolderArt folder={art} variant="hero" className="w-[46%] max-w-[210px]" />
        <h2 className="mt-5 flex max-w-full items-center gap-2 text-[26px] font-extrabold leading-tight tracking-[-0.02em] [text-wrap:balance]">
          {folder.emoji && <span className="shrink-0">{folder.emoji}</span>}
          <span className="min-w-0 break-words">{folder.name}</span>
        </h2>
        <p className="mt-1 text-sm tabular-nums text-muted">{shown.length} saved</p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex h-10 items-center gap-1.5 rounded-pill bg-accent px-5 text-sm font-extrabold text-accent-ink active:scale-[0.98]"
          >
            <Plus size={17} strokeWidth={2.6} /> Add
          </button>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex h-10 items-center gap-1.5 rounded-pill bg-elevated px-5 text-sm font-bold ring-1 ring-border active:scale-[0.98]"
          >
            Edit
          </button>
        </div>
      </section>

      {shown.length === 0 ? (
        <EmptyState icon={Plus} title="Nothing in here yet" text="Add posts and Shots you've saved." variant="compact" />
      ) : (
        <SavedGrid items={shown} selecting={selecting} selected={new Set(selected.keys())} onToggle={toggle} />
      )}

      <FolderEditor
        open={editing}
        onClose={() => setEditing(false)}
        title="Edit folder"
        submitLabel="Save"
        initial={{ name: folder.name, emoji: folder.emoji, color: folder.color }}
        preview={art}
        onSubmit={save}
        onDelete={() => {
          setEditing(false);
          setDeleting(true);
        }}
      />

      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={remove}
        icon={Trash2}
        title={`Delete ${folder.name}?`}
        body="Everything in it stays saved."
        confirmLabel="Delete"
      />

      <FolderAddPicker
        open={adding}
        onClose={(changed) => {
          setAdding(false);
          if (changed) void reload();
        }}
        folderId={folder.id}
        folderName={folder.name}
        userId={userId}
        inFolder={new Set(shown.map(itemKey))}
      />

      <FolderPickSheet
        open={moving}
        onClose={() => setMoving(false)}
        title={`Move ${selected.size} to`}
        folders={others}
        exclude={folder.id}
        onPick={(f) => void moveTo(f, [...selected.values()])}
        onNew={() => {
          setMoving(false);
          setMaking(true);
        }}
      />

      <FolderEditor
        open={making}
        onClose={() => setMaking(false)}
        title="New folder"
        submitLabel={`Make and move ${selected.size}`}
        initial={{ name: "", emoji: null, color: nextFolderColor(others.length) }}
        onSubmit={makeAndMove}
      />
    </div>
  );
}
