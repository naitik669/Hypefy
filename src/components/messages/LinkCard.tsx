"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { LinkPreview } from "@/lib/link-preview";

/**
 * The card under a message that has a link in it.
 *
 * Reading a conversation can pass the same link many times — scrolled past,
 * scrolled back to, re-rendered on every new message — and each pass would
 * otherwise be another fetch. The answers live in a module-level map for
 * the life of the tab: one request per link per session, and a link that
 * has no card does not get asked about again either.
 */
const answers = new Map<string, LinkPreview | null>();
const asking = new Map<string, Promise<LinkPreview | null>>();

async function unfurl(url: string): Promise<LinkPreview | null> {
  // Deduplicated by URL rather than by component, so three messages
  // carrying the same link make one request between them.
  const already = asking.get(url);
  if (already) return already;

  const run = (async () => {
    try {
      const res = await fetch(`/api/unfurl?url=${encodeURIComponent(url)}`);
      if (!res.ok) return null;
      return (await res.json()) as LinkPreview;
    } catch {
      // Offline, or the route said no. The link still reads as a link.
      return null;
    }
  })();
  asking.set(url, run);
  const got = await run;
  answers.set(url, got);
  asking.delete(url);
  return got;
}

export function LinkCard({ url, mine }: { url: string; mine: boolean }) {
  const [preview, setPreview] = useState<LinkPreview | null | undefined>(() =>
    answers.has(url) ? answers.get(url) : undefined,
  );
  // Which link the state above is about. A bubble can be handed a
  // different URL without unmounting, and adjusting during render rather
  // than in an effect means an already-read link draws its card on the
  // first pass instead of flashing empty for a frame.
  const [showing, setShowing] = useState(url);
  if (showing !== url) {
    setShowing(url);
    setPreview(answers.has(url) ? answers.get(url) : undefined);
  }

  useEffect(() => {
    if (answers.has(url)) return;
    let live = true;
    unfurl(url).then((got) => {
      if (live) setPreview(got);
    });
    return () => {
      live = false;
    };
  }, [url]);

  // Nothing while it is being read, and nothing if there is nothing to
  // show. A skeleton here would shift the thread under the reader's thumb
  // every time a card resolved, which is worse than the card arriving
  // quietly.
  if (!preview) return null;

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={`mt-1 flex max-w-[260px] flex-col overflow-hidden rounded-2xl border border-border bg-elevated text-left transition active:scale-[0.98] ${
        mine ? "self-end" : "self-start"
      }`}
    >
      {preview.image && (
        /* A remote host off next/image's configured loader list, and the
           URL is allowlist-checked rather than ours to optimise. */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview.image}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="aspect-[1.91/1] w-full object-cover"
        />
      )}
      <div className="flex flex-col gap-0.5 px-3 py-2">
        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-faint">
          <ExternalLink size={10} strokeWidth={2.6} aria-hidden />
          {preview.site}
        </span>
        <span className="line-clamp-2 text-[13px] font-bold leading-snug text-foreground">
          {preview.title}
        </span>
        {preview.description && (
          <span className="line-clamp-2 text-[11px] leading-snug text-muted">
            {preview.description}
          </span>
        )}
      </div>
    </a>
  );
}
