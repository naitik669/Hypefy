"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, X, Star } from "lucide-react";

export interface GifResult {
  id: string;
  /** downsized_medium URL — sent as the message body */
  gifUrl: string;
  /** Small WebP rendition — the grid thumbnail. */
  previewUrl: string;
  /** Intrinsic size of previewUrl, so the grid can hold the space for it. */
  width?: number;
  height?: number;
  title: string;
}

interface Props {
  onSelect: (gifUrl: string) => void;
}

// ── Categories ────────────────────────────────────────────────────────────────
type Cat = { id: string; emoji: null; label: string; query: string | null };

const CATEGORIES: Cat[] = [
  { id: "faves",     emoji: null, label: "Faves",     query: null },
  { id: "trending",  emoji: null, label: "Trending",  query: null },
  { id: "reactions", emoji: null, label: "Reactions", query: "reaction" },
  { id: "emotions",  emoji: null, label: "Emotions",  query: "emotion" },
  { id: "memes",     emoji: null, label: "Memes",     query: "meme" },
  { id: "cute",      emoji: null, label: "Cute",      query: "cute" },
  { id: "sports",    emoji: null, label: "Sports",    query: "sports" },
  { id: "movies",    emoji: null, label: "Movies",    query: "movie" },
];

// ── In-session cache — switching tabs re-uses already fetched results ─────────
const gifCache = new Map<string, GifResult[]>();

// ── Favourites — persisted in localStorage ────────────────────────────────────
const FAVES_KEY = "hypefy_gif_faves";
const MAX_FAVES = 50;

function readFaves(): GifResult[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(FAVES_KEY) ?? "[]") as GifResult[];
  } catch { return []; }
}
function writeFaves(next: GifResult[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(FAVES_KEY, JSON.stringify(next.slice(0, MAX_FAVES)));
}

// ── API helper ────────────────────────────────────────────────────────────────
async function apiFetch(
  query: string,
): Promise<{ gifs: GifResult[]; keyMissing: boolean; failed: boolean }> {
  const key = query.trim() || "__trending__";
  if (gifCache.has(key))
    return { gifs: gifCache.get(key)!, keyMissing: false, failed: false };
  const url = query.trim() ? `/api/gifs?q=${encodeURIComponent(query.trim())}` : `/api/gifs`;
  try {
    const res = await fetch(url);
    // 503 is the one actionable case — the key is not configured.
    if (res.status === 503) return { gifs: [], keyMissing: true, failed: false };
    // Anything else (Giphy down, rate limited, session expired) used to fall
    // through as an empty list and render "No GIFs found", which reads as
    // "your search matched nothing" rather than "this is broken".
    if (!res.ok) return { gifs: [], keyMissing: false, failed: true };
    const json = await res.json();
    const gifs = (json.gifs ?? []) as GifResult[];
    gifCache.set(key, gifs);
    return { gifs, keyMissing: false, failed: false };
  } catch {
    return { gifs: [], keyMissing: false, failed: true };
  }
}

/**
 * Discord-style GIF picker — categories, search, favourites.
 *
 * ⭐ Faves      → GIFs the user has hearted (localStorage, persists across sessions)
 * 🔥 Trending   → Giphy trending
 * 😂 Reactions  → search "reaction"
 * ❤️ Emotions   → search "emotion"
 * 😎 Memes      → search "meme"
 * 🐱 Cute       → search "cute"
 * ⚽ Sports     → search "sports"
 * 🎬 Movies     → search "movie"
 *
 * Search bar overrides the active category while typing.
 * Requires GIPHY_API_KEY (server-only) — fetches via /api/gifs proxy.
 */
export function GifPicker({ onSelect }: Props) {
  const [activeCat, setActiveCat] = useState("trending");
  const [search, setSearch] = useState("");
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [faves, setFaves] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyMissing, setKeyMissing] = useState(false);
  const [failed, setFailed] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const catBarRef = useRef<HTMLDivElement>(null);
  // Incremented on every new fetch — stale responses are discarded.
  const reqGen = useRef(0);

  // ── Load initial data ─────────────────────────────────────────────────────
  useEffect(() => {
    const savedFaves = readFaves();
    setFaves(savedFaves);
    const gen = ++reqGen.current;
    apiFetch("").then(({ gifs: result, keyMissing: km, failed: f }) => {
      if (reqGen.current !== gen) return; // superseded by a newer request
      setKeyMissing(km);
      setFailed(f);
      setGifs(result);
      setLoading(false);
    });
    inputRef.current?.focus();
  }, []);

  // ── Fetch for a category (no search) ─────────────────────────────────────
  const loadCategory = useCallback(async (catId: string) => {
    if (catId === "faves") {
      const saved = readFaves();
      setFaves(saved);
      setGifs(saved);
      setLoading(false);
      return;
    }
    const cat = CATEGORIES.find((c) => c.id === catId);
    if (!cat) { setLoading(false); return; }
    const gen = ++reqGen.current;
    setLoading(true);
    try {
      const { gifs: result, keyMissing: km, failed: f } = await apiFetch(cat.query ?? "");
      if (reqGen.current !== gen) return; // stale — a newer tab was clicked
      setKeyMissing(km);
      setFailed(f);
      setGifs(result);
    } finally {
      if (reqGen.current === gen) setLoading(false);
    }
  }, []);

  // ── Handle search input ───────────────────────────────────────────────────
  function handleSearch(q: string) {
    setSearch(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) {
      loadCategory(activeCat);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const gen = ++reqGen.current;
      try {
        const { gifs: result, keyMissing: km, failed: f } = await apiFetch(q);
        if (reqGen.current !== gen) return;
        setKeyMissing(km);
        setFailed(f);
        setGifs(result);
      } finally {
        if (reqGen.current === gen) setLoading(false);
      }
      // Shorter than it was: the old results now stay on screen while this
      // runs, so a spare request costs a lot less than the wait did. Still
      // long enough that a typed word is one search, not six.
    }, 240);
  }

  // ── Handle category tab click ─────────────────────────────────────────────
  function handleCat(catId: string) {
    if (catId === activeCat && !search) return;
    setActiveCat(catId);
    setSearch("");
    setLoading(true);
    loadCategory(catId);
  }

  // ── Favourite toggle ──────────────────────────────────────────────────────
  function toggleFave(e: React.MouseEvent, gif: GifResult) {
    e.stopPropagation();
    const current = readFaves();
    const idx = current.findIndex((f) => f.id === gif.id);
    const next = idx >= 0
      ? current.filter((_, i) => i !== idx)
      : [gif, ...current];
    writeFaves(next);
    setFaves(next);
    // If we're on the faves tab, keep the grid in sync
    if (activeCat === "faves" && !search) setGifs(next);
  }

  function isFaved(id: string) {
    return faves.some((f) => f.id === id);
  }

  const isSearching = search.trim().length > 0;
  const sectionLabel = isSearching ? "Results" : CATEGORIES.find((c) => c.id === activeCat)?.label ?? "Trending";

  return (
    <div className="flex h-[340px] flex-col overflow-hidden rounded-2xl border border-border bg-elevated shadow-2xl">

      {/* ── Search bar ── */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-3 py-2 focus-within:border-white/25">
        <Search size={14} className="shrink-0 text-faint" />
        <input
          ref={inputRef}
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search GIFs…"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
        />
        {search && (
          <button type="button" onClick={() => handleSearch("")} className="shrink-0 text-faint hover:text-muted">
            <X size={14} />
          </button>
        )}
      </div>

      {/* ── Category tabs ── */}
      {!isSearching && (
        <div
          ref={catBarRef}
          className="no-scrollbar flex shrink-0 gap-1.5 overflow-x-auto border-b border-border/40 px-2 py-1.5"
        >
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => handleCat(cat.id)}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
                activeCat === cat.id
                  ? "bg-accent text-accent-ink"
                  : "bg-surface text-muted hover:text-foreground"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Section label ── */}
      <div className="shrink-0 px-3 py-1">
        <span className="text-[10px] font-bold uppercase tracking-widest text-faint">
          {sectionLabel}
          {activeCat === "faves" && !isSearching && faves.length > 0 && (
            <span className="ml-1.5 text-faint/60">· {faves.length}</span>
          )}
        </span>
      </div>

      {/* ── GIF grid ── */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {keyMissing ? (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 px-4 text-center">
            <p className="text-xs font-semibold text-muted">GIFs not configured</p>
            <p className="text-[10px] leading-relaxed text-faint">
              Add <code className="rounded bg-surface px-1 text-[9px]">GIPHY_API_KEY</code> to
              Vercel Environment Variables, then redeploy.
            </p>
          </div>
        ) : loading && gifs.length === 0 ? (
          /* Skeleton grid — 3 columns, varying heights to mimic real masonry.
             Only when there is nothing to show yet. While REFINING a search
             the old results stay put and dim (see the grid below): blanking
             to a skeleton on every keystroke made the picker strobe, which
             is what made searching feel broken rather than slow. */
          <div className="columns-3 gap-1 space-y-1">
            {[72, 52, 88, 60, 96, 52, 80, 64, 72, 88, 56, 68].map((h, i) => (
              <div
                key={i}
                className="skeleton break-inside-avoid rounded-lg"
                style={{ height: h }}
              />
            ))}
          </div>
        ) : gifs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
            {activeCat === "faves" && !isSearching ? (
              <>
                <span className="text-2xl">⭐</span>
                <p className="text-xs font-semibold text-muted">No favourites yet</p>
                <p className="text-[10px] text-faint">Tap the ★ on any GIF to save it here</p>
              </>
            ) : failed ? (
              // Distinct from an empty search: "No GIFs found" reads as
              // "nothing matched", which sends people hunting for better
              // search terms when the service is simply unreachable.
              <>
                <p className="text-xs font-semibold text-muted">GIFs aren&rsquo;t loading</p>
                <p className="text-[10px] text-faint">
                  The GIF service didn&rsquo;t respond. Try again in a moment.
                </p>
              </>
            ) : (
              <span className="text-xs text-faint">No GIFs found</span>
            )}
          </div>
        ) : (
          /* CSS columns = natural masonry, no JS needed */
          <div
            className="columns-3 gap-1 space-y-1 transition-opacity duration-150"
            style={{ opacity: loading ? 0.45 : 1 }}
          >
            {gifs.map((gif) => (
              <div key={gif.id} className="relative break-inside-avoid">
                <button
                  type="button"
                  onClick={() => onSelect(gif.gifUrl)}
                  className="block w-full overflow-hidden rounded-lg transition-opacity active:opacity-60"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={gif.previewUrl}
                    alt={gif.title}
                    className="w-full rounded-lg bg-surface"
                    loading="lazy"
                    decoding="async"
                    // The masonry re-flowed on every arrival without these —
                    // two dozen column-height recalculations, which is what
                    // the "lag" was. aspectRatio holds the slot from the
                    // first paint; the tinted background makes the slot read
                    // as loading rather than as a hole.
                    style={
                      gif.width && gif.height
                        ? { aspectRatio: `${gif.width} / ${gif.height}` }
                        : undefined
                    }
                  />
                </button>

                {/* Heart / fave button — always visible, top-right of each GIF */}
                <button
                  type="button"
                  onClick={(e) => toggleFave(e, gif)}
                  aria-label={isFaved(gif.id) ? "Remove from favourites" : "Add to favourites"}
                  className="absolute right-1 top-1 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-black/55 backdrop-blur-sm transition-transform active:scale-110"
                >
                  <Star
                    size={9}
                    className={isFaved(gif.id) ? "fill-accent text-accent" : "fill-transparent text-white/80"}
                  />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── GIPHY attribution (required by ToS) ── */}
      {!keyMissing && (
        <div className="shrink-0 border-t border-border/40 px-3 py-1 text-right">
          <span className="text-[9px] font-bold uppercase tracking-widest text-faint/50">
            Powered by GIPHY
          </span>
        </div>
      )}
    </div>
  );
}
