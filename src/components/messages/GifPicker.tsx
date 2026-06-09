"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

interface GifResult {
  id: string;
  /** downsized_medium — reasonable size for sending (~500–900 KB) */
  gifUrl: string;
  /** fixed_height_small — fast-loading thumbnail for the picker grid */
  previewUrl: string;
  title: string;
}

interface Props {
  onSelect: (gifUrl: string) => void;
}

const GIPHY_KEY = process.env.NEXT_PUBLIC_GIPHY_API_KEY ?? "";
const LIMIT = 24;
const RATING = "pg-13";

async function fetchGiphyGifs(query: string): Promise<GifResult[]> {
  if (!GIPHY_KEY) return [];
  const endpoint = query.trim()
    ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(query)}&limit=${LIMIT}&rating=${RATING}&lang=en`
    : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_KEY}&limit=${LIMIT}&rating=${RATING}`;
  try {
    const res = await fetch(endpoint);
    if (!res.ok) return [];
    const json = await res.json();
    return ((json.data ?? []) as Record<string, unknown>[])
      .map((r) => {
        const imgs = (r.images ?? {}) as Record<string, { url?: string }>;
        return {
          id: String(r.id ?? ""),
          // Prefer downsized_medium for the sent URL; fall back to original
          gifUrl:
            imgs.downsized_medium?.url ??
            imgs.original?.url ??
            "",
          // fixed_height_small is fast in the grid; preview_gif as fallback
          previewUrl:
            imgs.fixed_height_small?.url ??
            imgs.preview_gif?.url ??
            imgs.downsized_medium?.url ??
            "",
          title: String(r.title ?? ""),
        };
      })
      .filter((g) => g.gifUrl && g.previewUrl);
  } catch {
    return [];
  }
}

/**
 * Discord-style GIF picker powered by GIPHY.
 *
 * — Search bar at top (debounced 380 ms)
 * — CSS columns masonry grid (3 cols) — natural varying heights
 * — Trending GIFs on open; search results while typing
 * — Requires NEXT_PUBLIC_GIPHY_API_KEY in .env.local
 *   (free key at developers.giphy.com — 100 req/hr on Giphy's free tier)
 */
export function GifPicker({ onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load trending GIFs on mount
  useEffect(() => {
    fetchGiphyGifs("").then((results) => {
      setGifs(results);
      setLoading(false);
    });
    // Auto-focus the search box so the user can type immediately
    inputRef.current?.focus();
  }, []);

  function handleQuery(q: string) {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const results = await fetchGiphyGifs(q);
      setGifs(results);
      setLoading(false);
    }, 380);
  }

  const noKey = !GIPHY_KEY;

  return (
    <div className="flex h-72 flex-col overflow-hidden rounded-2xl border border-border bg-elevated shadow-2xl">

      {/* ── Search bar ──────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <Search size={14} className="shrink-0 text-faint" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => handleQuery(e.target.value)}
          placeholder="Search GIFs…"
          disabled={noKey}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
        />
        {query && (
          <button
            type="button"
            onClick={() => handleQuery("")}
            className="shrink-0 text-faint hover:text-muted"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* ── Section label ───────────────────────────────────────── */}
      <div className="px-3 py-1.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-faint">
          {query.trim() ? "Results" : "Trending"}
        </span>
      </div>

      {/* ── GIF grid ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {noKey ? (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center">
            <p className="text-xs font-semibold text-muted">GIFs not configured</p>
            <p className="text-[10px] text-faint">
              Add{" "}
              <code className="rounded bg-surface px-1 text-[9px]">
                NEXT_PUBLIC_GIPHY_API_KEY
              </code>{" "}
              to .env.local
            </p>
          </div>
        ) : loading ? (
          <div className="flex h-full items-center justify-center">
            <span className="flex gap-1.5">
              {[0, 0.12, 0.24].map((delay, i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-faint animate-dot-bounce"
                  style={{ animationDelay: `${delay}s` }}
                />
              ))}
            </span>
          </div>
        ) : gifs.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-xs text-faint">No GIFs found</span>
          </div>
        ) : (
          /* CSS columns = natural masonry layout, no JS needed */
          <div className="columns-3 gap-1 space-y-1">
            {gifs.map((gif) => (
              <button
                key={gif.id}
                type="button"
                onClick={() => onSelect(gif.gifUrl)}
                className="block w-full overflow-hidden rounded-lg transition-opacity active:opacity-60"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={gif.previewUrl}
                  alt={gif.title}
                  className="w-full rounded-lg"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── GIPHY attribution — required by Giphy API ToS ───────── */}
      {!noKey && (
        <div className="border-t border-border/40 px-3 py-1 text-right">
          <span className="text-[9px] font-bold uppercase tracking-widest text-faint/50">
            Powered by GIPHY
          </span>
        </div>
      )}
    </div>
  );
}
