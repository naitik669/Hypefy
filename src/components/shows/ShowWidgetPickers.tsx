"use client";

import { useEffect, useState } from "react";
import { Link2, MessageCircleQuestion, Image as ImageIcon, Film } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { EmptyState } from "@/components/ui/EmptyState";
import { Avatar } from "@/components/ui/Avatar";
import { type Suggestion, useMentionHashtag } from "@/components/ui/MentionHashtagPicker";

/**
 * The sheets behind the Show editor's widget tray.
 *
 * Three of the widgets already had a picker somewhere in the app and are
 * reused rather than rebuilt: a song comes from TrackPicker, a poll from
 * PollComposer, and the people search behind a mention is the same hook
 * the chat composer's typeahead uses, driven with a synthetic "@query"
 * so there is one definition of who matches. What is new here is only
 * what had nowhere to come from: a link, a question, and picking one of
 * your own posts or Shots to embed.
 */

/** What a post or Shot embed shows once somebody is looking at it. */
export type EmbedState = {
  thumb: string | null;
  caption: string | null;
  /** Deleted, or taken down, since the Show was made. */
  gone?: boolean;
};

/** The same shape readPayload accepts, so a sheet cannot offer a bad one. */
const LINK_OK = /^https:\/\/[^\s]+$/i;

export function LinkSheet({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (url: string) => void;
}) {
  const [raw, setRaw] = useState("");

  // Typing "hypefy.app" is what people do; it is a link they mean, so the
  // scheme is added rather than the input refused.
  const url = (() => {
    const t = raw.trim();
    if (!t) return "";
    const full = /^https?:\/\//i.test(t) ? t.replace(/^http:\/\//i, "https://") : `https://${t}`;
    return LINK_OK.test(full) ? full : "";
  })();

  return (
    <BottomSheet open={open} onClose={onClose} title="Add a link">
      <div className="space-y-3 px-4 pb-4">
        <label htmlFor="show-link" className="sr-only">
          Where it goes
        </label>
        <input
          id="show-link"
          autoFocus
          value={raw}
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          maxLength={2048}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="hypefy.app/…"
          className="h-12 w-full rounded-xl bg-surface px-4 text-sm text-foreground outline-none placeholder:text-muted"
        />
        <button
          type="button"
          disabled={!url}
          onClick={() => {
            onPick(url);
            setRaw("");
            onClose();
          }}
          className="h-12 w-full rounded-xl bg-accent text-sm font-extrabold text-accent-ink disabled:opacity-40"
        >
          Add it
        </button>
        <p className="text-xs text-muted">
          Only https links. People see where it goes before they tap.
        </p>
      </div>
    </BottomSheet>
  );
}

export function MentionSheet({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (username: string) => void;
}) {
  const [query, setQuery] = useState("");
  // The chat composer's own search, asked the same question: a value that
  // is one mention, with the caret at its end.
  const typed = `@${query}`;
  const { suggestions } = useMentionHashtag(typed, typed.length);
  const people = suggestions.filter(
    (s): s is Extract<Suggestion, { kind: "mention" }> => s.kind === "mention",
  );

  return (
    <BottomSheet open={open} onClose={onClose} title="Mention somebody" size="half">
      <div className="space-y-2 px-4 pb-4">
        <label htmlFor="show-mention" className="sr-only">
          Who
        </label>
        <input
          id="show-mention"
          autoFocus
          value={query}
          autoCapitalize="none"
          autoCorrect="off"
          maxLength={32}
          onChange={(e) => setQuery(e.target.value.replace(/^@/, ""))}
          placeholder="Search people"
          className="h-12 w-full rounded-xl bg-surface px-4 text-sm text-foreground outline-none placeholder:text-muted"
        />
        {people.map((person) => (
          <button
            key={person.id}
            type="button"
            onClick={() => {
              onPick(person.username);
              setQuery("");
              onClose();
            }}
            className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/5"
          >
            <Avatar
              name={person.display_name ?? person.username}
              hue={person.avatar_hue ?? 280}
              size={34}
              src={person.avatar_url ?? undefined}
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">
                {person.display_name ?? person.username}
              </span>
              <span className="block truncate text-xs text-muted">@{person.username}</span>
            </span>
          </button>
        ))}
        {query.trim() !== "" && people.length === 0 && (
          <p className="py-6 text-center text-sm text-muted">Nobody by that name.</p>
        )}
      </div>
    </BottomSheet>
  );
}

/** One of your own posts or Shots, as the picker lists it. */
type Mine = { kind: "post" | "shot"; id: string; thumb: string | null; caption: string | null };

/**
 * Your own posts and Shots, to embed one.
 *
 * Only your own: embedding is a way of pointing at something you made,
 * and a picker over everybody's would be a way of attaching a stranger's
 * picture to your Show.
 */
export function EmbedSheet({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (choice: Mine) => void;
}) {
  const [supabase] = useState(createClient);
  const [mine, setMine] = useState<Mine[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let dropped = false;

    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user?.id;
      if (!me) {
        if (!dropped) setMine([]);
        return;
      }

      const [posts, shots] = await Promise.all([
        supabase
          .from("posts")
          .select("id, image_url, image_urls, caption, body, created_at")
          .eq("user_id", me)
          .is("removed_at", null)
          .order("created_at", { ascending: false })
          .limit(24),
        supabase
          .from("shots")
          .select("id, poster_url, caption, created_at")
          .eq("user_id", me)
          .is("removed_at", null)
          .order("created_at", { ascending: false })
          .limit(24),
      ]);

      if (dropped) return;
      setMine([
        ...(posts.data ?? []).map((p) => ({
          kind: "post" as const,
          id: p.id,
          thumb: p.image_url ?? p.image_urls?.[0] ?? null,
          caption: p.caption ?? p.body ?? null,
        })),
        ...(shots.data ?? []).map((s) => ({
          kind: "shot" as const,
          id: s.id,
          thumb: s.poster_url ?? null,
          caption: s.caption ?? null,
        })),
      ]);
    })();

    return () => {
      dropped = true;
    };
  }, [open, supabase]);

  return (
    <BottomSheet open={open} onClose={onClose} title="Embed something of yours" size="tall">
      <div className="px-4 pb-4">
        {mine === null && <p className="py-10 text-center text-sm text-muted">Finding them…</p>}
        {mine !== null && mine.length === 0 && (
          <EmptyState
            icon={ImageIcon}
            title="Nothing to embed yet"
            text="Post something or shoot a Shot, then it can go on a Show."
          />
        )}
        {mine !== null && mine.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {mine.map((item) => (
              <button
                key={`${item.kind}-${item.id}`}
                type="button"
                onClick={() => {
                  onPick(item);
                  onClose();
                }}
                className="relative aspect-square overflow-hidden rounded-xl bg-surface transition active:scale-95"
              >
                {item.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.thumb} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-muted">
                    {item.kind === "shot" ? <Film size={20} /> : <ImageIcon size={20} />}
                  </span>
                )}
                {item.kind === "shot" && (
                  <span className="absolute right-1.5 top-1.5 rounded-pill bg-black/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                    Shot
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

/** The two icons the tray borrows for the widgets that have no picker of their own. */
export const WIDGET_ICONS = { link: Link2, question: MessageCircleQuestion } as const;
