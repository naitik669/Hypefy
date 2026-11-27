"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { VerifiedStar } from "@/components/ui/VerifiedStar";
import { FollowButton } from "@/components/profile/FollowButton";
import { pagesOf, type PeopleSuggestion } from "@hypefy/core/people-rank";

/** Where ✕ remembers who you hid. Per device: hiding someone is a preference, not a fact about them. */
export const HIDDEN_KEY = "hypefy:people-hidden";

/** The stored text, as a store React can read during render without an effect. */
const HIDDEN_EVENT = "hypefy:people-hidden-change";

function subscribeHidden(onChange: () => void) {
  window.addEventListener(HIDDEN_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(HIDDEN_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function hiddenSnapshot(): string {
  try {
    return window.localStorage.getItem(HIDDEN_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

/** The server has no storage, so it renders everyone; the browser then hides who you hid. */
const serverSnapshot = () => "[]";

function parseHidden(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeHidden(ids: string[]) {
  try {
    window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(ids));
  } catch {
    // Private mode or storage full: nothing is remembered, and nothing breaks.
  }
  window.dispatchEvent(new Event(HIDDEN_EVENT));
}

/**
 * Four to a page on a phone (two by two), eight on a desktop (four by two).
 * The grid's columns follow the same breakpoint, so a page is always full rows.
 */
function usePageSize() {
  const [size, setSize] = useState(4);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const set = () => setSize(mq.matches ? 8 : 4);
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, []);
  return size;
}

/**
 * The People grid: pages of follow tiles you swipe through sideways.
 *
 * Swiping is the browser's own scroll with snap points, not a drag handler.
 * It is the one that already feels right under a thumb, a trackpad and a
 * mouse wheel, and it is what a keyboard and a screen reader can move
 * through without being taught. A swipe only moves between pages: it never
 * follows anyone, so following always takes a deliberate tap.
 */
export function PeopleGrid({ people }: { people: PeopleSuggestion[] }) {
  const raw = useSyncExternalStore(subscribeHidden, hiddenSnapshot, serverSnapshot);
  const hidden = useMemo(() => parseHidden(raw), [raw]);
  const [page, setPage] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const size = usePageSize();

  const shown = useMemo(() => people.filter((p) => !hidden.includes(p.id)), [people, hidden]);
  const pages = useMemo(() => pagesOf(shown, size), [shown, size]);

  const onScroll = useCallback(() => {
    const el = track.current;
    if (!el || !el.clientWidth) return;
    setPage(Math.round(el.scrollLeft / el.clientWidth));
  }, []);

  function hide(id: string) {
    writeHidden([...hidden, id]);
  }

  function goTo(i: number) {
    const el = track.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }

  if (shown.length === 0) {
    return (
      <div className="flex flex-col items-center px-8 py-20 text-center">
        <h2 className="text-xl font-extrabold tracking-tight">You&apos;ve seen everyone for now</h2>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">
          New people show up here as they join and start hyping.
        </p>
        {hidden.length > 0 && (
          <button
            type="button"
            onClick={() => writeHidden([])}
            className="mt-6 h-11 rounded-pill border border-border px-5 text-sm font-bold text-foreground hover:bg-white/[0.04]"
          >
            Show the {hidden.length === 1 ? "one" : hidden.length} you hid
          </button>
        )}
      </div>
    );
  }

  const current = Math.min(page, pages.length - 1);

  return (
    <section aria-label="Suggested people">
      <div
        ref={track}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {pages.map((pg, i) => (
          <div
            key={i}
            role="group"
            aria-label={`Page ${i + 1} of ${pages.length}`}
            className="grid w-full shrink-0 snap-start auto-rows-[17rem] grid-cols-2 gap-3 px-4 md:grid-cols-4 md:gap-4 md:px-6"
          >
            {pg.map((p) => (
              <PersonTile key={p.id} person={p} onHide={() => hide(p.id)} />
            ))}
          </div>
        ))}
      </div>

      {pages.length > 1 && (
        <div className="mt-5 flex justify-center gap-1.5">
          {pages.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Go to page ${i + 1}`}
              aria-current={i === current ? "true" : undefined}
              className="flex h-6 items-center px-0.5"
            >
              <span
                aria-hidden
                className={`h-1.5 rounded-full transition-all ${i === current ? "w-[18px] bg-foreground" : "w-1.5 bg-border"}`}
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * One tile: the profile card's machined plate, small.
 *
 * Same plate, same hairlines and the same painted foot in the person's own
 * accent as the card behind an expanded avatar, so a tile reads as that card
 * in miniature. The face is the app's squircle Avatar, not a circle: the
 * rounded square is Hypefy's, and a circle here would be the one round face
 * in the app.
 */
function PersonTile({ person: p, onHide }: { person: PeopleSuggestion; onHide: () => void }) {
  const href = p.username ? `/u/${p.username}` : "#";
  return (
    <article
      className="relative flex min-w-0 flex-col items-center overflow-hidden rounded-[22px] px-3 pb-3.5 pt-5 text-center"
      style={{
        background: "#0b0b0c",
        border: "1px solid rgba(255,255,255,0.09)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.13), inset 0 -1px 0 rgba(0,0,0,0.8)",
      }}
    >
      <button
        type="button"
        onClick={onHide}
        aria-label={`Hide ${p.name}`}
        className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full text-white/45 transition hover:bg-white/[0.06] hover:text-white/80"
      >
        <X size={15} strokeWidth={2.4} />
      </button>

      <Link href={href} className="rounded-[32%] p-[2px]" style={{ background: "rgba(255,255,255,0.11)" }}>
        <Avatar name={p.name} hue={p.avatar_hue ?? 200} size={88} src={p.avatar_url ?? undefined} />
      </Link>

      <Link href={href} className="mt-3.5 flex max-w-full items-center justify-center gap-1 hover:underline">
        <span className="truncate text-[15px] font-extrabold tracking-tight">{p.name}</span>
        {p.verified && <VerifiedStar className="h-4 w-4 shrink-0" />}
      </Link>
      <p className="mt-1 text-[12.5px] font-medium text-muted">{p.reason}</p>

      <div className="mt-2 flex h-[22px] items-center justify-center">
        {p.mutuals.map((m) => (
          <span key={m.id} className="-mx-[3px] rounded-[30%] ring-2 ring-[#0b0b0c]" title={m.name}>
            <Avatar name={m.name} hue={m.avatar_hue ?? 200} size={20} src={m.avatar_url ?? undefined} />
          </span>
        ))}
      </div>

      <div className="mt-auto flex w-full">
        <FollowButton targetUserId={p.id} targetUsername={p.username} initialFollowing={false} />
      </div>

      <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2.5px]" style={{ background: p.accent }} />
    </article>
  );
}
