"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Check, Loader2, Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/ToastProvider";

type Choice = { id: string; thumb: string | null; caption: string | null; savedAt: string };

const PAGE = 60;

/**
 * Add saved posts to a collection.
 *
 * The old picker was handed the caller's saved-posts array, which the profile
 * tab had capped at 30 — so posts you had saved earlier could not be filed at
 * all. This reads saved_posts itself and pages through them, which is the
 * whole reason the cap mattered.
 */
export function CollectionPicker({
  collectionId,
  userId,
}: {
  collectionId: string;
  userId: string;
}) {
  const supabase = createClient();
  const router = useRouter();
  const showToast = useToast();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Choice[]>([]);
  const [inIt, setInIt] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [touched, setTouched] = useState(false);
  const busy = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (busy.current || done) return;
    busy.current = true;
    setLoading(true);

    const cursor = rows[rows.length - 1]?.savedAt;
    const { data, error } = await supabase
      .from("saved_posts")
      .select("created_at, posts(id, image_url, image_urls, caption)")
      .eq("user_id", userId)
      .lt("created_at", cursor ?? new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(PAGE);

    // A failed page must not latch done — otherwise a blip hides the rest of
    // your saves for as long as the picker stays open.
    if (!error) {
      const fresh: Choice[] = (data ?? []).flatMap((r: Record<string, unknown>) => {
        const raw = r.posts as Record<string, unknown> | Record<string, unknown>[] | null;
        const p = Array.isArray(raw) ? raw[0] : raw;
        if (!p) return [];
        return [
          {
            id: p.id as string,
            thumb:
              ((p.image_urls as string[] | null)?.[0] ?? (p.image_url as string | null)) ?? null,
            caption: (p.caption as string) ?? null,
            savedAt: r.created_at as string,
          },
        ];
      });
      setRows((prev) => [...prev, ...fresh]);
      if ((data?.length ?? 0) < PAGE) setDone(true);
    }

    setLoading(false);
    busy.current = false;
  }, [done, rows, supabase, userId]);

  // Membership is read once per opening, so the ticks are right even for posts
  // that page in later.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("collection_items")
        .select("post_id")
        .eq("collection_id", collectionId);
      if (!cancelled) {
        setInIt(new Set((data ?? []).flatMap((r) => (r.post_id ? [r.post_id] : []))));
      }
    })();
    void loadMore();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, collectionId]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !open) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "400px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, open]);

  async function toggle(post: Choice) {
    const wasIn = inIt.has(post.id);
    const { error } = wasIn
      ? await supabase
          .from("collection_items")
          .delete()
          .eq("collection_id", collectionId)
          .eq("post_id", post.id)
      : await supabase
          .from("collection_items")
          .insert({ collection_id: collectionId, post_id: post.id });

    if (error) {
      showToast(wasIn ? "Couldn't remove that post." : "Couldn't add that post.");
      return;
    }

    const next = new Set(inIt);
    if (wasIn) next.delete(post.id);
    else next.add(post.id);
    setInIt(next);
    setTouched(true);

    // First item in becomes the cover, as before.
    if (!wasIn && next.size === 1 && post.thumb) {
      await supabase.from("collections").update({ cover_url: post.thumb }).eq("id", collectionId);
    }
  }

  function close() {
    setOpen(false);
    setRows([]);
    setDone(false);
    // Only re-render the page if something actually changed.
    if (touched) {
      setTouched(false);
      router.refresh();
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 items-center gap-1 rounded-pill bg-accent px-3 text-xs font-bold text-accent-ink active:scale-[0.98]"
      >
        <Plus size={15} /> Add
      </button>

      {open && (
        <div className="fixed inset-0 z-50 mx-auto flex max-w-[480px] flex-col bg-background">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/60 px-2">
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/5"
            >
              <X size={22} />
            </button>
            <p className="flex-1 truncate text-sm font-bold">Add saved posts</p>
            <span className="pr-2 text-xs text-muted">{inIt.size} in</span>
          </header>

          <div className="flex-1 overflow-y-auto">
            {rows.length === 0 && done ? (
              <EmptyState
                icon={Bookmark}
                title="Nothing saved yet"
                text="Save a post first, then file it here."
                variant="compact"
              />
            ) : (
              <div className="grid grid-cols-3 gap-1.5 p-1.5">
                {rows.map((p) => {
                  const on = inIt.has(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => void toggle(p)}
                      className="relative aspect-square overflow-hidden rounded-xl bg-surface"
                    >
                      {p.thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.thumb}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center p-1 text-center text-[9px] leading-tight text-faint">
                          {p.caption?.slice(0, 40) ?? "Post"}
                        </span>
                      )}
                      <span
                        className={`absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                          on
                            ? "border-accent bg-accent text-accent-ink"
                            : "border-white/70 bg-black/30"
                        }`}
                      >
                        {on && <Check size={12} strokeWidth={3} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {!done && (
              <div ref={sentinel} className="flex justify-center py-6">
                {loading && <Loader2 size={18} className="animate-spin text-muted" />}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
