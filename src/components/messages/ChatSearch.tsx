"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * Finding something said in a chat.
 *
 * The search runs in the database, over the whole thread — not over the
 * messages the screen happens to be holding, which is the last thirty and
 * is never what someone is looking for.
 *
 * Opening a result is the caller's job: only the thread knows whether that
 * message is on screen yet, and how to fetch back to it if not.
 */

export type FoundMessage = { id: string; sender_id: string; body: string | null; created_at: string };

/** How long to wait after the last keystroke before asking. */
export const SEARCH_DEBOUNCE_MS = 250;
/** Shorter than this finds half the chat, so it waits. */
export const SEARCH_MIN = 2;

/** The words around the match, so a long message does not hide what was found. */
export function around(body: string, q: string, width = 70): string {
  const at = body.toLowerCase().indexOf(q.toLowerCase());
  if (at < 0 || body.length <= width) return body;
  const from = Math.max(0, at - Math.floor(width / 3));
  return (from > 0 ? "…" : "") + body.slice(from, from + width).trim() + (from + width < body.length ? "…" : "");
}

export function ChatSearch({
  conversationId,
  nameOf,
  dayLabel,
  onOpen,
  onClose,
}: {
  conversationId: string;
  /** Who sent it, for the line under each result. */
  nameOf: (senderId: string) => string;
  dayLabel: (iso: string) => string;
  onOpen: (message: FoundMessage) => void;
  onClose: () => void;
}) {
  const supabase = createClient();
  const [q, setQ] = useState("");
  /** The last answer, and the words it answers — so a stale one is not shown. */
  const [answer, setAnswer] = useState<{ q: string; rows: FoundMessage[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const term = q.trim();
  const tooShort = term.length < SEARCH_MIN;
  // Derived rather than kept: clearing the box must not need a render to
  // undo, and an answer to older words must never be shown against newer.
  const results = !tooShort && answer?.q === term ? answer.rows : null;
  const searching = !tooShort && results === null;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    // Below the minimum is not a search, so nothing is asked and nothing is
    // said about having found nothing.
    if (tooShort) return;
    let alive = true;
    const t = setTimeout(() => {
      void supabase
        .rpc("search_messages", { p_conversation_id: conversationId, p_q: term })
        .then(({ data, error }) => {
          if (alive) setAnswer({ q: term, rows: error ? [] : ((data ?? []) as FoundMessage[]) });
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [term, tooShort, conversationId, supabase]);

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-background" data-chat-search>
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-pill bg-surface px-3">
          <Search size={15} className="shrink-0 text-faint" aria-hidden />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a message…"
            aria-label="Find a message in this chat"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
          />
          {searching && <Loader2 size={14} className="animate-spin text-faint" aria-hidden />}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-pill px-2 py-2 text-sm font-semibold text-muted transition-colors hover:text-foreground"
        >
          Cancel
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {results === null ? (
          <p className="px-5 pt-8 text-center text-sm text-faint">
            Type at least {SEARCH_MIN} letters to search everything said here.
          </p>
        ) : results.length === 0 ? (
          <p className="px-5 pt-8 text-center text-sm text-faint">Nothing matches “{term}”.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border/50">
            {results.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => onOpen(m)}
                  className="flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left transition-colors hover:bg-white/[0.04]"
                >
                  <span className="line-clamp-2 text-sm leading-snug">{around(m.body ?? "", term)}</span>
                  <span className="text-xs text-faint">
                    {nameOf(m.sender_id)} · {dayLabel(m.created_at)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** The X that closes the panel, for a caller that wants one in its header. */
export function CloseSearch({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Close search" className="p-2 text-muted">
      <X size={20} />
    </button>
  );
}
