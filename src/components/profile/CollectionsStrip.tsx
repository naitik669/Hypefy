"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FolderPlus, X, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";

type Collection = { id: string; name: string; cover_url: string | null; count: number };

/**
 * Bookmark collections shown atop the profile Saved tab. Lets the owner
 * group their saved posts into named folders. Owner-only (RLS enforced).
 *
 * Opening one used to raise a full-screen modal that had its own header, back
 * chevron and title bar — a page in everything but the URL, and one that
 * tapping any item inside destroyed with no way back. Tiles now link to
 * /collections/[id], which is that page for real.
 */
export function CollectionsStrip({ userId }: { userId: string }) {
  const supabase = createClient();
  const stripToast = useToast();
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

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
          <Link key={c.id} href={`/collections/${c.id}`} className="w-24 shrink-0 text-left">
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
          </Link>
        ))}
      </div>
    </div>
  );
}
