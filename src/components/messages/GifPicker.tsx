"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

interface GifResult {
  id: string;
  /** downsized_medium — reasonable size for sending */
  gifUrl: string;
  /** fixed_height_small — fast thumbnail for the picker grid */
  previewUrl: string;
  title: string;
}

interface Props {
  onSelect: (gifUrl: string) => void;
}

/**
 * Fetches from our own /api/gifs proxy — keeps the Giphy key server-side,
 * avoids CORS, and works regardless of NEXT_PUBLIC_ build-time baking.
 */
async function fetchGifs(query: string): Promise<GifResult[]> {
  const url = query.trim()
    ? `/api/gifs?q=${encodeURIComponent(query)}`
    : `/api/gifs`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    return (json.gifs ?? []) as GifResult[];
  } catch {
    return [];
  }
}

/**
 * Discord-style GIF picker.
 * — Search bar (debounced 380 ms)
 * — CSS columns masonry grid (3 cols)
 * — Trending on open, search results while typing
 * — Requires GIPHY_API_KEY in Vercel / .env.local (no NEXT_PUBLIC_ prefix)
 */
export function GifPicker({ onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [noKey, setNoKey] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchGifs("").then((results) => {
      if (results.length === 0) {
        // Could be key missing or empty — show no-key state to surface the issue
        setNoKey(true);
      }
      setGifs(results);
      setLoading(false);
    });
    inputRef.current?.focus();
  }, []);

  function handleQuery(q: string) {
    setQuery(q);
    setNoKey(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const results = await fetchGifs(q);
      setGifs(results);
      setLoading(false);
    }, 380);
  }

  return (
    <div className="flex h-72 flex-col overflow-hidden rounded-2xl border border-border bg-elevated shadow-2xl">

      {/* ── Search bar ── */}
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <Search size={14} className="shrink-0 text-faint" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => handleQuery(e.target.value)}
          placeholder="Search GIFs…"
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

      {/* ── Section label ── */}
      <div className="px-3 py-1.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-faint">
          {query.trim() ? "Results" : "Trending"}
        </span>
      </div>

      {/* ── GIF grid ── */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {noKey ? (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center px-4">
            <p className="text-xs font-semibold text-muted">GIFs not configured</p>
            <p className="text-[10px] text-faint leading-relaxed">
              Add <code className="rounded bg-surface px-1 text-[9px]">GIPHY_API_KEY</code> to
              Vercel Environment Variables, then redeploy.
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

      {/* ── GIPHY attribution (required by Giphy ToS) ── */}
      {!noKey && !loading && (
        <div className="border-t border-border/40 px-3 py-1 text-right">
          <span className="text-[9px] font-bold uppercase tracking-widest text-faint/50">
            Powered by GIPHY
          </span>
        </div>
      )}
    </div>
  );
}
