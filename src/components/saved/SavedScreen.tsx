"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownUp, Bookmark, BookmarkMinus, ChevronLeft, FolderPlus, Loader2, Plus, Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { safeBack } from "@/lib/safe-back";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/ToastProvider";
import { FolderShelf } from "@/components/saved/FolderShelf";
import { SavedGrid } from "@/components/saved/SavedGrid";
import { FolderEditor, type FolderDraft } from "@/components/saved/FolderEditor";
import { FolderPickSheet } from "@/components/saved/FolderPickSheet";
import { scheduleUndoable } from "@/lib/undoable";
import { haptics } from "@/lib/haptics";
import { makeFolder, nextFolderColor, toFolder, type Folder } from "@/lib/folders";
import {
  foundItem,
  itemKey,
  mergeSaved,
  SAVED_POST_COLS,
  SAVED_SHOT_COLS,
  savedPost,
  savedShot,
  type SavedItem,
  type SavedOrder,
} from "@/lib/saved";

type Tab = "all" | "posts" | "shots";

const HEADER = "sticky top-0 z-20 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center gap-1 border-b border-border/60 bg-background/85 px-2 pt-[env(safe-area-inset-top)] backdrop-blur-xl";
const ICON_BTN = "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-white/5";

/**
 * Saved: your folders, then everything you have saved, newest first.
 *
 * Search looks through what you saved by caption or by who posted it. Hold
 * any saved thing to start selecting; a selection can go into a folder, or
 * be unsaved (with Undo — unsaving takes things out of every folder too).
 *
 * Posts and Shots page separately (each keyset-paged on when you saved it)
 * and are merged only as far as both have loaded — see mergeSaved.
 */
export function SavedScreen({
  userId,
  initialPosts,
  initialShots,
  initialFolders,
  totalSaved,
  pageSize,
}: {
  userId: string;
  initialPosts: SavedItem[];
  initialShots: SavedItem[];
  initialFolders: Folder[];
  totalSaved: number | null;
  pageSize: number;
}) {
  const supabase = createClient();
  const router = useRouter();
  const toast = useToast();

  const [tab, setTab] = useState<Tab>("all");
  const [order, setOrder] = useState<SavedOrder>("newest");
  const [posts, setPosts] = useState(initialPosts);
  const [shots, setShots] = useState(initialShots);
  const [postsDone, setPostsDone] = useState(initialPosts.length < pageSize);
  const [shotsDone, setShotsDone] = useState(initialShots.length < pageSize);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(totalSaved);
  const busy = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const recents = useRef<HTMLDivElement>(null);

  const [folders, setFolders] = useState(initialFolders);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const [selected, setSelected] = useState<Map<string, SavedItem>>(new Map());
  const selecting = selected.size > 0;

  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<SavedItem[] | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  /** The folder being made is for the selection, which goes straight in. */
  const [makingForSelection, setMakingForSelection] = useState(false);

  // ── Loading ───────────────────────────────────────────────────────────
  const fetchPage = useCallback(
    async (kind: "post" | "shot", after: string | undefined, o: SavedOrder) => {
      let query = supabase
        .from(kind === "post" ? "saved_posts" : "saved_shots")
        .select(kind === "post" ? SAVED_POST_COLS : SAVED_SHOT_COLS)
        .eq("user_id", userId);
      if (after) query = o === "newest" ? query.lt("created_at", after) : query.gt("created_at", after);
      const { data, error } = await query.order("created_at", { ascending: o === "oldest" }).limit(pageSize);
      if (error) return null;
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      return {
        items: rows.flatMap((r) => {
          const i = kind === "post" ? savedPost(r) : savedShot(r);
          return i ? [i] : [];
        }),
        done: rows.length < pageSize,
      };
    },
    [supabase, userId, pageSize]
  );

  const loadMore = useCallback(async () => {
    if (busy.current) return;
    const wantPosts = tab !== "shots" && !postsDone;
    const wantShots = tab !== "posts" && !shotsDone;
    if (!wantPosts && !wantShots) return;
    busy.current = true;
    setLoading(true);
    const [p, s] = await Promise.all([
      wantPosts ? fetchPage("post", posts[posts.length - 1]?.savedAt, order) : null,
      wantShots ? fetchPage("shot", shots[shots.length - 1]?.savedAt, order) : null,
    ]);
    // A failed page must not latch "done" — that turns a blip into a short list.
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
  }, [tab, postsDone, shotsDone, fetchPage, posts, shots, order]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && void loadMore(), { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  /** Oldest first, or back: start both lists again from that end. */
  async function flipOrder() {
    const o: SavedOrder = order === "newest" ? "oldest" : "newest";
    haptics.select();
    setOrder(o);
    busy.current = true;
    setLoading(true);
    setPosts([]);
    setShots([]);
    setPostsDone(false);
    setShotsDone(false);
    const [p, s] = await Promise.all([fetchPage("post", undefined, o), fetchPage("shot", undefined, o)]);
    setPosts(p?.items ?? []);
    setShots(s?.items ?? []);
    setPostsDone(p?.done ?? false);
    setShotsDone(s?.done ?? false);
    setLoading(false);
    busy.current = false;
  }

  const refreshFolders = useCallback(async () => {
    const { data } = await supabase.rpc("get_folders");
    if (data) setFolders(data.map(toFolder));
  }, [supabase]);

  // ── Search ────────────────────────────────────────────────────────────
  useEffect(() => {
    const term = q.trim();
    if (!searching || !term) return;
    let gone = false;
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("search_saved", { p_q: term, p_limit: 90 });
      if (!gone) setFound((data ?? []).map(foundItem));
    }, 250);
    return () => {
      gone = true;
      clearTimeout(t);
    };
  }, [q, searching, supabase]);

  function closeSearch() {
    setSearching(false);
    setQ("");
    setFound(null);
  }

  // ── Selection ─────────────────────────────────────────────────────────
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

  const clearSelection = () => setSelected(new Map());

  function split(items: SavedItem[]) {
    return {
      p_posts: items.filter((i) => i.kind === "post").map((i) => i.id),
      p_shots: items.filter((i) => i.kind === "shot").map((i) => i.id),
    };
  }

  async function fileInto(folder: Folder, items: SavedItem[]) {
    setPickOpen(false);
    const { error } = await supabase.rpc("file_items", { p_folder: folder.id, ...split(items) });
    if (error) {
      toast("Couldn't add to that folder", "error");
      return;
    }
    haptics.success();
    toast(`Added to ${folder.name}`, "success");
    clearSelection();
    void refreshFolders();
  }

  function unsave(items: SavedItem[]) {
    const keys = items.map(itemKey);
    setHidden((prev) => new Set([...prev, ...keys]));
    clearSelection();
    const { p_posts, p_shots } = split(items);
    const cancel = scheduleUndoable(async () => {
      const [a, b] = await Promise.all([
        p_posts.length ? supabase.from("saved_posts").delete().eq("user_id", userId).in("post_id", p_posts) : { error: null },
        p_shots.length ? supabase.from("saved_shots").delete().eq("user_id", userId).in("shot_id", p_shots) : { error: null },
      ]);
      if (a.error || b.error) {
        setHidden((prev) => new Set([...prev].filter((k) => !keys.includes(k))));
        toast("Couldn't unsave those", "error");
        return;
      }
      setTotal((t) => (t === null ? t : Math.max(0, t - items.length)));
      void refreshFolders();
    });
    toast(items.length === 1 ? "Unsaved" : `Unsaved ${items.length}`, "plain", {
      label: "Undo",
      onClick: () => {
        cancel();
        setHidden((prev) => new Set([...prev].filter((k) => !keys.includes(k))));
      },
    });
  }

  // ── Folders ───────────────────────────────────────────────────────────
  async function createFolder(draft: FolderDraft) {
    const made = await makeFolder(supabase, userId, draft, folders);
    if (!made) {
      toast("Couldn't make that folder", "error");
      return false;
    }
    setFolders((all) => [...all, made]);
    if (makingForSelection) {
      setMakingForSelection(false);
      void fileInto(made, [...selected.values()]);
    } else toast(`Made ${made.name}`, "success");
    return true;
  }

  async function reorder(ids: string[]) {
    const byId = new Map(folders.map((f) => [f.id, f]));
    setFolders(ids.flatMap((id, i) => (byId.has(id) ? [{ ...byId.get(id)!, position: i }] : [])));
    const { error } = await supabase.rpc("reorder_folders", { p_ids: ids });
    if (error) {
      toast("Couldn't save that order", "error");
      void refreshFolders();
    }
  }

  // ── What is on screen ─────────────────────────────────────────────────
  const visible = (list: SavedItem[]) => list.filter((i) => !hidden.has(itemKey(i)));
  const items = visible(
    tab === "posts" ? posts : tab === "shots" ? shots : mergeSaved(posts, shots, order, { posts: postsDone, shots: shotsDone })
  );
  const done = tab === "posts" ? postsDone : tab === "shots" ? shotsDone : postsDone && shotsDone;
  const newest = visible(order === "newest" ? mergeSaved(posts, shots, "newest", { posts: postsDone, shots: shotsDone }) : []);
  const allCovers = (newest.length ? newest : items).slice(0, 4).map((i) => ({ kind: i.kind, thumb: i.thumb, video: i.video }));
  const nothing = initialPosts.length === 0 && initialShots.length === 0 && folders.length === 0 && items.length === 0 && done;

  return (
    <div className="flex min-h-full flex-col pb-10">
      {/* The header is the screen's mode: plain, searching, or selecting. */}
      {selecting ? (
        <header className={HEADER}>
          <button type="button" onClick={clearSelection} aria-label="Stop selecting" className={ICON_BTN}>
            <X size={22} />
          </button>
          <h1 className="flex-1 truncate px-1 text-[17px] font-extrabold tabular-nums tracking-tight">{selected.size} selected</h1>
          <button
            type="button"
            onClick={() => setPickOpen(true)}
            className="flex h-9 items-center gap-1.5 rounded-pill bg-elevated px-3.5 text-xs font-bold ring-1 ring-border transition-colors active:bg-white/10"
          >
            <FolderPlus size={15} /> Folder
          </button>
          <button
            type="button"
            onClick={() => unsave([...selected.values()])}
            className="mr-1 flex h-9 items-center gap-1.5 rounded-pill bg-elevated px-3.5 text-xs font-bold text-danger ring-1 ring-border transition-colors active:bg-white/10"
          >
            <BookmarkMinus size={15} /> Unsave
          </button>
        </header>
      ) : searching ? (
        <header className={HEADER}>
          <button type="button" onClick={closeSearch} aria-label="Close search" className={ICON_BTN}>
            <ChevronLeft size={24} />
          </button>
          <label className="flex h-10 flex-1 items-center gap-2 rounded-pill bg-surface px-3.5 ring-1 ring-border focus-within:ring-accent/60">
            <Search size={16} className="shrink-0 text-muted" />
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                if (!e.target.value.trim()) setFound(null);
              }}
              placeholder="Search saved"
              aria-label="Search saved"
              enterKeyHint="search"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
            />
            {q && (
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  setFound(null);
                }}
                aria-label="Clear"
                className="text-muted"
              >
                <X size={16} />
              </button>
            )}
          </label>
          <span className="w-1" />
        </header>
      ) : (
        <header className={HEADER}>
          <button type="button" onClick={() => safeBack(router)} aria-label="Back" className={ICON_BTN}>
            <ChevronLeft size={24} />
          </button>
          <h1 className="flex-1 truncate px-1 text-[17px] font-extrabold tracking-tight">Saved</h1>
          <button type="button" onClick={() => setSearching(true)} aria-label="Search saved" className={ICON_BTN}>
            <Search size={20} />
          </button>
          <button
            type="button"
            onClick={() => {
              setMakingForSelection(false);
              setEditorOpen(true);
            }}
            aria-label="New folder"
            className={ICON_BTN}
          >
            <Plus size={22} />
          </button>
        </header>
      )}

      {searching ? (
        <div className="pt-2">
          {found === null ? (
            q.trim() ? (
              <div className="flex justify-center py-10">
                <Loader2 size={18} className="animate-spin text-muted" />
              </div>
            ) : null
          ) : visible(found).length === 0 ? (
            <EmptyState icon={Search} title="Nothing matches" text="Try a word from the caption, or who posted it." variant="compact" />
          ) : (
            <SavedGrid items={visible(found)} selecting={selecting} selected={new Set(selected.keys())} onToggle={toggle} />
          )}
        </div>
      ) : nothing ? (
        <EmptyState
          icon={Bookmark}
          title="Nothing saved yet"
          text="Tap the bookmark on any post or Shot to keep it here. Hold it to put it in a folder."
        />
      ) : (
        <>
          <FolderShelf
            folders={folders}
            all={{ count: total, covers: allCovers }}
            onOpenAll={() => {
              setTab("all");
              recents.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            onReorder={(ids) => void reorder(ids)}
            onNew={() => {
              setMakingForSelection(false);
              setEditorOpen(true);
            }}
          />

          <div ref={recents} className="scroll-mt-[calc(3.5rem+env(safe-area-inset-top))] pt-6">
            <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-10 flex items-center gap-1 bg-background/90 px-4 py-2 backdrop-blur-xl">
              {(
                [
                  ["all", "All"],
                  ["posts", "Posts"],
                  ["shots", "Shots"],
                ] as [Tab, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  aria-pressed={tab === id}
                  className={`rounded-pill px-3.5 py-1.5 text-xs font-bold transition-colors ${
                    tab === id ? "bg-foreground text-background" : "bg-surface text-muted hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => void flipOrder()}
                aria-label={order === "newest" ? "Newest first. Show oldest first" : "Oldest first. Show newest first"}
                className="ml-auto flex items-center gap-1.5 rounded-pill px-2.5 py-1.5 text-xs font-bold text-muted transition-colors hover:text-foreground"
              >
                <ArrowDownUp size={14} />
                {order === "newest" ? "Newest" : "Oldest"}
              </button>
            </div>

            {items.length === 0 && done ? (
              <EmptyState
                icon={Bookmark}
                title={tab === "shots" ? "No saved Shots" : tab === "posts" ? "No saved posts" : "Nothing saved yet"}
                text="Tap the bookmark on anything you want back."
                variant="compact"
              />
            ) : (
              <SavedGrid items={items} selecting={selecting} selected={new Set(selected.keys())} onToggle={toggle} />
            )}

            {!done && (
              <div ref={sentinel} className="flex justify-center py-6">
                {loading && <Loader2 size={18} className="animate-spin text-muted" />}
              </div>
            )}
          </div>
        </>
      )}

      <FolderEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title="New folder"
        submitLabel={makingForSelection ? `Make and add ${selected.size}` : "Make folder"}
        initial={{ name: "", emoji: null, color: nextFolderColor(folders.length) }}
        onSubmit={createFolder}
      />

      <FolderPickSheet
        open={pickOpen}
        onClose={() => setPickOpen(false)}
        title={`Add ${selected.size} to`}
        folders={folders}
        onPick={(f) => void fileInto(f, [...selected.values()])}
        onNew={() => {
          setPickOpen(false);
          setMakingForSelection(true);
          setEditorOpen(true);
        }}
      />
    </div>
  );
}
