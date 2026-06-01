"use client";

import { useState } from "react";
import { Link2, Zap, Repeat2, Check, Search } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Avatar } from "@/components/ui/Avatar";
import { VerifiedStar } from "@/components/ui/VerifiedStar";
import { threads } from "@/lib/mock-messages";

export function ShareSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  const filtered = threads.filter(
    (t) =>
      query.trim() === "" ||
      t.name.toLowerCase().includes(query.toLowerCase()) ||
      t.handle.toLowerCase().includes(query.toLowerCase()),
  );

  function toggleSend(id: string) {
    setSent((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText("https://www.hypefy.chat/p/aman");
    } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Share">
      {/* Search */}
      <div className="mb-3 flex h-10 items-center gap-2 rounded-pill border border-border bg-surface px-3">
        <Search size={16} className="shrink-0 text-faint" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search friends…"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
        />
      </div>

      {/* People list — vertical scroll */}
      <div className="mb-1 flex max-h-56 flex-col overflow-y-auto">
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-faint">No results</p>
        )}
        {filtered.map((t) => {
          const selected = sent.has(t.id);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => toggleSend(t.id)}
              className={`flex items-center gap-3 rounded-xl px-1 py-2.5 transition-colors ${
                selected ? "bg-accent/10" : "hover:bg-white/[0.04]"
              }`}
            >
              <Avatar name={t.name} hue={t.hue} size={44} />
              <div className="min-w-0 flex-1 text-left">
                <div className="flex items-center gap-1">
                  <span className="truncate text-sm font-semibold">{t.name}</span>
                  {t.verified && (
                    <VerifiedStar className="h-3.5 w-3.5 shrink-0 text-verified" />
                  )}
                </div>
                <p className="truncate text-xs text-muted">{t.handle}</p>
              </div>
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold transition-colors ${
                  selected
                    ? "border-accent bg-accent text-accent-ink"
                    : "border-border"
                }`}
              >
                {selected && "✓"}
              </span>
            </button>
          );
        })}
      </div>

      {/* Actions — horizontal row */}
      <div className="flex items-start justify-around border-t border-border pt-4 pb-1">
        <button
          type="button"
          onClick={copyLink}
          className="flex flex-col items-center gap-2 rounded-xl px-3 py-1 transition-colors active:opacity-70"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface">
            {copied ? <Check size={20} className="text-accent" /> : <Link2 size={20} />}
          </span>
          <span className="text-xs text-muted">{copied ? "Copied!" : "Copy link"}</span>
        </button>
        <button
          type="button"
          className="flex flex-col items-center gap-2 rounded-xl px-3 py-1 transition-colors active:opacity-70"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface">
            <Zap size={20} className="text-hype" />
          </span>
          <span className="text-xs text-muted">Shot</span>
        </button>
        <button
          type="button"
          className="flex flex-col items-center gap-2 rounded-xl px-3 py-1 transition-colors active:opacity-70"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface">
            <Repeat2 size={20} />
          </span>
          <span className="text-xs text-muted">Repost</span>
        </button>
      </div>
    </BottomSheet>
  );
}
