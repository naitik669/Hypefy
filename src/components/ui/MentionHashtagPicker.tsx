"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";

type Suggestion =
  | { kind: "hashtag"; tag: string; count: number }
  | { kind: "mention"; id: string; username: string; display_name: string | null; avatar_hue: number | null; avatar_url: string | null };

type Trigger = { type: "hashtag" | "mention"; query: string; startIndex: number };

function detectTrigger(value: string, cursor: number): Trigger | null {
  const before = value.slice(0, cursor);
  // Walk back from cursor to find the trigger character
  const hashMatch = before.match(/#(\w*)$/);
  const mentionMatch = before.match(/@(\w*)$/);
  if (hashMatch && hashMatch.index !== undefined) {
    return { type: "hashtag", query: hashMatch[1], startIndex: hashMatch.index };
  }
  if (mentionMatch && mentionMatch.index !== undefined) {
    return { type: "mention", query: mentionMatch[1], startIndex: mentionMatch.index };
  }
  return null;
}

/**
 * Apply a suggestion to the current text value, replacing the trigger word.
 * Returns the new value string.
 */
export function applySuggestion(
  value: string,
  cursor: number,
  suggestion: Suggestion,
): { newValue: string; newCursor: number } {
  const trigger = detectTrigger(value, cursor);
  if (!trigger) return { newValue: value, newCursor: cursor };

  const insert =
    suggestion.kind === "hashtag"
      ? `#${suggestion.tag} `
      : `@${suggestion.username} `;

  const before = value.slice(0, trigger.startIndex);
  const after = value.slice(cursor);
  const newValue = before + insert + after;
  return { newValue, newCursor: trigger.startIndex + insert.length };
}

/**
 * Hook: watch a text value + cursor position, detect # or @ triggers,
 * fetch suggestions, and return them. Call reset() to close.
 */
export function useMentionHashtag(value: string, cursorPos: number) {
  const supabase = createClient();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    setSuggestions([]);
    setTrigger(null);
  }, []);

  useEffect(() => {
    const t = detectTrigger(value, cursorPos);
    setTrigger(t);
    if (!t) { setSuggestions([]); return; }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (t.type === "hashtag") {
        const q = t.query.toLowerCase();
        // Fetch recent posts (hashtags column only) and tally matches client-side.
        // No PostgREST operator supports "array element starts-with", so we do it here.
        const { data } = await supabase
          .from("posts")
          .select("hashtags")
          .order("created_at", { ascending: false })
          .limit(500);

        const counts = new Map<string, number>();
        for (const row of data ?? []) {
          for (const tag of (row.hashtags ?? []) as string[]) {
            const tl = tag.toLowerCase();
            if (!q || tl.startsWith(q)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
          }
        }
        const sorted = [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([tag, count]) => ({ kind: "hashtag" as const, tag, count }));
        // If no existing tags match the typed query, offer the raw query as a new tag
        setSuggestions(sorted.length ? sorted : q ? [{ kind: "hashtag", tag: q, count: 0 }] : []);
      } else {
        const q = t.query.toLowerCase();
        if (!q) { setSuggestions([]); return; }
        const { data } = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_hue, avatar_url")
          .ilike("username", `${q}%`)
          .limit(8);
        setSuggestions(
          (data ?? []).map((p: any) => ({
            kind: "mention" as const,
            id: p.id,
            username: p.username,
            display_name: p.display_name,
            avatar_hue: p.avatar_hue ?? 280,
            avatar_url: p.avatar_url,
          })),
        );
      }
    }, 180);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, cursorPos]);

  return { suggestions, trigger, reset };
}

/**
 * Floating suggestion dropdown — renders below/above the input.
 * Parent controls open state by passing non-empty suggestions.
 */
export function SuggestionDropdown({
  suggestions,
  onSelect,
}: {
  suggestions: Suggestion[];
  onSelect: (s: Suggestion) => void;
}) {
  if (!suggestions.length) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 z-50 mb-1 max-h-52 overflow-y-auto rounded-2xl border border-border bg-elevated shadow-2xl [scrollbar-width:none]">
      {suggestions.map((s, i) =>
        s.kind === "hashtag" ? (
          <button
            key={i}
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onSelect(s); }}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-sm font-bold text-accent">#</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">#{s.tag}</p>
              {s.count > 0 && <p className="text-xs text-muted">{s.count} post{s.count !== 1 ? "s" : ""}</p>}
            </div>
          </button>
        ) : (
          <button
            key={s.id}
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onSelect(s); }}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5"
          >
            <Avatar name={s.display_name ?? s.username} hue={s.avatar_hue ?? 280} size={32} src={s.avatar_url ?? undefined} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{s.display_name ?? s.username}</p>
              {s.username && <p className="truncate text-xs text-muted">@{s.username}</p>}
            </div>
          </button>
        ),
      )}
    </div>
  );
}
