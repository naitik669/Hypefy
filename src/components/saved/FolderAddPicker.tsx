"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bookmark, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/ToastProvider";
import { useOverlayBackButton } from "@/lib/overlay-stack";
import { SavedGrid } from "@/components/saved/SavedGrid";
import { haptics } from "@/lib/haptics";
import { fetchSavedPage, itemKey, mergeSaved, type SavedItem } from "@/lib/saved";

const PAGE = 60;

/**
 * Fill a folder from what you have saved — posts and Shots alike, newest
 * first. Everything already in the folder starts ticked; each tap puts one
 * in or takes it out straight away. Done hands back whether anything
 * changed, so the folder only reloads when it has to.
 */
export function FolderAddPicker({
  open,
  onClose,
  folderId,
  folderName,
  userId,
  inFolder,
}: {
  open: boolean;
  onClose: (changed: boolean) => void;
  folderId: string;
  folderName: string;
  userId: string;
  /** itemKey()s of what the folder holds now. */
  inFolder: Set<string>;
}) {
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <Picker onClose={onClose} folderId={folderId} folderName={folderName} userId={userId} inFolder={inFolder} />,
    document.body
  );
}

function Picker({
  onClose,
  folderId,
  folderName,
  userId,
  inFolder,
}: {
  onClose: (changed: boolean) => void;
  folderId: string;
  folderName: string;
  userId: string;
  inFolder: Set<string>;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [posts, setPosts] = useState<SavedItem[]>([]);
  const [shots, setShots] = useState<SavedItem[]>([]);
  const [postsDone, setPostsDone] = useState(false);
  const [shotsDone, setShotsDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inside, setInside] = useState(() => new Set(inFolder));
  const [changed, setChanged] = useState(false);
  const busy = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const done = () => onClose(changed);
  useOverlayBackButton(true, done);

  const loadMore = useCallback(async () => {
    if (busy.current || (postsDone && shotsDone)) return;
    busy.current = true;
    setLoading(true);
    const [p, s] = await Promise.all([
      postsDone ? null : fetchSavedPage(supabase, userId, "post", posts[posts.length - 1]?.savedAt, "newest", PAGE),
      shotsDone ? null : fetchSavedPage(supabase, userId, "shot", shots[shots.length - 1]?.savedAt, "newest", PAGE),
    ]);
    if (p) {
      setPosts((prev) => [...prev, ...p.items]);
      if (p.done) setPostsDone(true);
    }
    if (s) {
      setShots((prev) => [...prev, ...s.items]);
      if (s.done) setShotsDone(true);
    }
    setLoading(false);
    busy.current = false;
  }, [postsDone, shotsDone, supabase, userId, posts, shots]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && void loadMore(), { rootMargin: "500px" });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  async function toggle(item: SavedItem) {
    haptics.select();
    const k = itemKey(item);
    const leaving = inside.has(k);
    const next = new Set(inside);
    if (leaving) next.delete(k);
    else next.add(k);
    setInside(next);
    const col = item.kind === "post" ? "post_id" : "shot_id";
    const { error } = leaving
      ? await supabase.from("collection_items").delete().eq("collection_id", folderId).eq(col, item.id)
      : await supabase
          .from("collection_items")
          .insert(item.kind === "post" ? { collection_id: folderId, post_id: item.id } : { collection_id: folderId, shot_id: item.id });
    if (error && !/duplicate|unique/i.test(error.message)) {
      setInside((now) => {
        const back = new Set(now);
        if (leaving) back.add(k);
        else back.delete(k);
        return back;
      });
      toast(leaving ? "Couldn't take that out" : "Couldn't add that", "error");
      return;
    }
    setChanged(true);
  }

  const items = mergeSaved(posts, shots, "newest", { posts: postsDone, shots: shotsDone });
  const all = postsDone && shotsDone;

  return (
    <div className="fixed inset-0 z-[150] mx-auto flex max-w-[480px] flex-col bg-background">
      <header className="flex h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center gap-2 border-b border-border/60 px-4 pt-[env(safe-area-inset-top)]">
        <p className="min-w-0 flex-1 truncate text-[17px] font-extrabold tracking-tight">Add to {folderName}</p>
        <button
          type="button"
          onClick={done}
          className="flex h-9 items-center rounded-pill bg-accent px-4 text-xs font-extrabold text-accent-ink active:scale-[0.98]"
        >
          Done
        </button>
      </header>

      <div className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)] pt-1">
        {items.length === 0 && all ? (
          <EmptyState icon={Bookmark} title="Nothing saved yet" text="Save a post or Shot first, then add it here." variant="compact" />
        ) : (
          <SavedGrid items={items} selecting selected={inside} onToggle={(i) => void toggle(i)} />
        )}
        {!all && (
          <div ref={sentinel} className="flex justify-center py-6">
            {loading && <Loader2 size={18} className="animate-spin text-muted" />}
          </div>
        )}
      </div>
    </div>
  );
}
