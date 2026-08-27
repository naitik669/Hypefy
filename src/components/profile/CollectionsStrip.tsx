"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FolderPlus, Plus, X, Check, Loader2, Trash2, ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/ToastProvider";

type SavedPost = { id: string; image_url: string | null; image_urls?: string[] | null; caption: string | null };
type Collection = { id: string; name: string; cover_url: string | null; count: number };

function cover(p: SavedPost): string | null {
  return p.image_url ?? p.image_urls?.[0] ?? null;
}

/**
 * Bookmark collections shown atop the profile Saved tab. Lets the owner
 * group their saved posts into named folders. Owner-only (RLS enforced).
 */
export function CollectionsStrip({ userId, savedPosts }: { userId: string; savedPosts: SavedPost[] }) {
  const supabase = createClient();
  const stripToast = useToast();
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [open, setOpen] = useState<Collection | null>(null);

  async function load() {
    const { data } = await supabase
      .from("collections")
      .select("id, name, cover_url, collection_items(count)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    setCollections(
      (data ?? []).map((c: any) => ({
        id: c.id, name: c.name, cover_url: c.cover_url,
        count: Array.isArray(c.collection_items) ? (c.collection_items[0]?.count ?? 0) : 0,
      })),
    );
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [userId]);

  async function createCollection() {
    const name = newName.trim();
    if (!name) return;
    const { error } = await supabase.from("collections").insert({ user_id: userId, name });
    if (error) { stripToast("Couldn't create that collection."); return; }
    setNewName(""); setCreating(false); load();
  }

  if (collections === null) return null;

  return (
    <div className="px-4 pb-2">
      <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
        {/* New collection */}
        {creating ? (
          <div className="flex w-32 shrink-0 flex-col gap-1 rounded-2xl border border-border bg-surface p-2">
            <input
              autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createCollection()}
              placeholder="Name" className="h-8 w-full rounded-lg bg-elevated px-2 text-xs outline-none focus:border-white/25" />
            <div className="flex gap-1">
              <button type="button" onClick={createCollection} className="flex h-7 flex-1 items-center justify-center rounded-lg bg-accent text-accent-ink"><Check size={14} /></button>
              <button type="button" onClick={() => { setCreating(false); setNewName(""); }} className="flex h-7 w-7 items-center justify-center rounded-lg bg-elevated text-muted"><X size={14} /></button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setCreating(true)}
            className="flex aspect-square w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-border text-muted hover:text-foreground">
            <FolderPlus size={22} />
            <span className="text-[11px] font-semibold">New</span>
          </button>
        )}

        {collections.map((c) => (
          <button key={c.id} type="button" onClick={() => setOpen(c)} className="w-24 shrink-0 text-left">
            <div className="relative aspect-square overflow-hidden rounded-2xl bg-surface">
              {c.cover_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.cover_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-faint"><FolderPlus size={24} /></div>
              )}
            </div>
            <p className="mt-1 truncate text-xs font-semibold">{c.name}</p>
            <p className="text-[10px] text-faint">{c.count} {c.count === 1 ? "item" : "items"}</p>
          </button>
        ))}
      </div>

      {open && (
        <CollectionModal
          collection={open}
          savedPosts={savedPosts}
          onClose={() => { setOpen(null); load(); }}
        />
      )}
    </div>
  );
}

function CollectionModal({ collection, savedPosts, onClose }: { collection: Collection; savedPosts: SavedPost[]; onClose: () => void }) {
  const supabase = createClient();
  const showToast = useToast();
  const [itemIds, setItemIds] = useState<Set<string> | null>(null);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await supabase.from("collection_items").select("post_id").eq("collection_id", collection.id);
    setItemIds(new Set((data ?? []).map((r: any) => r.post_id)));
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [collection.id]);

  async function toggle(post: SavedPost) {
    if (!itemIds) return;
    setBusy(true);
    const wasIn = itemIds.has(post.id);
    const { error } = wasIn
      ? await supabase.from("collection_items").delete().eq("collection_id", collection.id).eq("post_id", post.id)
      : await supabase.from("collection_items").insert({ collection_id: collection.id, post_id: post.id });
    setBusy(false);
    if (error) {
      // Previously silent — the tile flipped state while the DB was unchanged.
      showToast(wasIn ? "Couldn't remove that post." : "Couldn't add that post.");
      return;
    }

    if (wasIn) itemIds.delete(post.id);
    else itemIds.add(post.id);
    setItemIds(new Set(itemIds));

    // First item becomes the cover.
    if (!wasIn && itemIds.size === 1) {
      const c = cover(post);
      if (c) await supabase.from("collections").update({ cover_url: c }).eq("id", collection.id);
    }
  }

  async function remove() {
    if (!confirm(`Delete "${collection.name}"?`)) return;
    const { error } = await supabase.from("collections").delete().eq("id", collection.id);
    if (error) {
      showToast("Couldn't delete that collection.");
      return;
    }
    onClose();
  }

  const inCollection = savedPosts.filter((p) => itemIds?.has(p.id));

  return (
    <div className="fixed inset-0 z-50 mx-auto flex max-w-[480px] flex-col bg-background">
      <header className="flex h-14 items-center gap-2 border-b border-border/60 px-2">
        <button type="button" onClick={onClose} aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/5"><ChevronLeft size={24} /></button>
        <p className="flex-1 truncate text-sm font-bold">{collection.name}</p>
        <button type="button" onClick={() => setPicker((v) => !v)} className="flex h-9 items-center gap-1 rounded-pill bg-accent px-3 text-xs font-bold text-accent-ink"><Plus size={15} /> Add</button>
        <button type="button" onClick={remove} aria-label="Delete collection" className="flex h-10 w-10 items-center justify-center rounded-full text-red-400 hover:bg-white/5"><Trash2 size={18} /></button>
      </header>

      <div className="flex-1 overflow-y-auto">
        {picker ? (
          <div className="p-1.5">
            <p className="px-2.5 py-2 text-xs text-muted">Tap saved posts to add or remove.</p>
            {savedPosts.length === 0 ? (
              <p className="px-3 py-10 text-center text-sm text-faint">Save some posts first.</p>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {savedPosts.map((p) => {
                  const inIt = itemIds?.has(p.id);
                  const c = cover(p);
                  return (
                    <button key={p.id} type="button" disabled={busy} onClick={() => toggle(p)} className="relative aspect-square overflow-hidden rounded-xl bg-surface disabled:opacity-60">
                      {c ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center p-1 text-[9px] text-faint">{p.caption ?? "Post"}</div>
                      )}
                      <span className={`absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 ${inIt ? "border-accent bg-accent text-accent-ink" : "border-white/70 bg-black/30"}`}>
                        {inIt && <Check size={12} strokeWidth={3} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : itemIds === null ? null : inCollection.length === 0 ? (
          <EmptyState
            variant="compact"
            icon={FolderPlus}
            title="Nothing in here yet"
            text="Tap Add to fill this collection with your saved posts."
          />
        ) : (
          <div className="grid grid-cols-3 gap-1.5 p-1.5">
            {inCollection.map((p) => (
              <Link key={p.id} href={`/p/${p.id}`} className="relative aspect-square overflow-hidden rounded-xl bg-surface">
                {cover(p) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover(p)!} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center p-1 text-[9px] text-faint">{p.caption ?? "Post"}</div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
