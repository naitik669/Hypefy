"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EMPTY_SHELF, loadSoundShelf, type SoundShelf } from "@/lib/sound-shelf";
import {
  forgetSearches,
  loadRecentSearches,
  rememberSearch,
  RECENT_SHOWN,
} from "@/lib/recent-searches";
import { SOUND_CATEGORIES } from "@/lib/sound-categories";
import { Music, Search, Play, Pause, ChevronLeft, Check, Plus, Clock, X } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { EmptyState } from "@/components/ui/EmptyState";
import { Waveform } from "@/components/music/Waveform";
import { SnippetTimeline } from "@/components/music/SnippetTimeline";
import {
  type Track,
  playPreview,
  ensurePreviewPlaying,
  pausePreview,
  stopPreview,
  usePlayingTrackId,
} from "@/lib/music";

/** Fallback track length when a source gives none — Apple previews run ~30s.
 *  Spotify tracks carry their real duration, so the timeline spans the whole
 *  song rather than a preview. */
const FALLBACK_LEN = 30;
const SNIPPET_LEN = 30;

/** Seconds of song this track offers, and the last start that still fits a
 *  full snippet inside it. */
function spanOf(t: Track | null) {
  const total = t?.durationMs ? t.durationMs / 1000 : FALLBACK_LEN;
  return { total, maxStart: Math.max(0, total - SNIPPET_LEN) };
}

/** m:ss — the timeline spans a whole song now, so minutes are real. */
function fmt(s: number) {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

/** One song, in any of the picker's lists. */
function SongRow({
  track: t,
  playing,
  marked,
  onPick,
}: {
  track: Track;
  playing: boolean;
  marked: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={`flex w-full items-center gap-3 rounded-xl px-1 py-2 text-left transition-colors ${
        marked ? "bg-accent/[0.06]" : "hover:bg-white/[0.04]"
      }`}
    >
      <span
        role="button"
        tabIndex={0}
        aria-label={playing ? "Pause preview" : "Play preview"}
        onClick={(e) => {
          e.stopPropagation();
          playPreview(t, { audible: true });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            playPreview(t, { audible: true });
          }
        }}
        className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-surface"
      >
        {t.artwork ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.artwork} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-faint">
            <Music size={16} />
          </span>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
          {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{t.title}</span>
        <span className="block truncate text-xs text-muted">{t.artist}</span>
      </span>
      {/* A ring rather than the word "Add", which was ten lime blocks down
          the edge of a list meant to be read — and which said the same
          thing on every row. The ring fills into a tick on the song you are
          choosing, so backing out of the snippet step shows you where you
          were. */}
      <span
        aria-hidden
        className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-accent transition-colors ${
          marked ? "bg-accent text-accent-ink" : "text-accent"
        }`}
      >
        {marked ? <Check size={15} strokeWidth={3} /> : <Plus size={15} strokeWidth={2.6} />}
      </span>
    </button>
  );
}

/**
 * Song search sheet (iTunes via /api/music): type to search, tap artwork to
 * hear the 30s preview, tap the row to pick — then choose which part of the
 * preview the song starts from before attaching. Closing stops any preview.
 */
export function TrackPicker({
  open,
  onClose,
  onSelect,
  pickPart = true,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (track: Track) => void;
  /**
   * Whether picking a song goes on to choosing the moment it starts. A
   * Show chooses its part on the sticker, so it takes the song as it is.
   */
  pickPart?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  // Snippet step: the track being trimmed + chosen start offset
  const [snippet, setSnippet] = useState<Track | null>(null);
  /**
   * The song being chosen, kept after the snippet step is backed out of.
   *
   * It is not "added": confirming closes the whole sheet, so there is no
   * list left to mark. It is the row you were last on, which is the thing
   * you want to see when you come back from trimming to try a different one.
   */
  const [marked, setMarked] = useState<string | null>(null);
  const [start, setStart] = useState(0);
  const playingId = usePlayingTrackId();
  /**
   * What to offer before anything is typed: the sounds this person saved,
   * then what is being used on Hypefy. An empty search box with nothing
   * under it made every Shot start from a blank.
   */
  const [shelf, setShelf] = useState<SoundShelf>(EMPTY_SHELF);
  /** Which half of the picker you are on while nothing is being searched. */
  const [tab, setTab] = useState<"foryou" | "saved">("foryou");
  /**
   * The field has the caret. An empty field that has been tapped shows
   * what is trending rather than the shelves — you reached for search, so
   * the answer to "search for what?" is the first thing to offer.
   */
  const [focused, setFocused] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [allRecent, setAllRecent] = useState(false);
  const [allForYou, setAllForYou] = useState(false);
  useEffect(() => {
    if (!open) return;
    let live = true;
    const supabase = createClient();
    void supabase.auth
      .getUser()
      .then(({ data }) => loadSoundShelf(supabase, data.user?.id ?? null))
      .then((s) => {
        if (live) setShelf(s);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a one-time read of browser-only storage
    setRecent(loadRecentSearches());
  }, [open]);

  /**
   * What the body is showing. Results win over everything; an empty field
   * with the caret in it shows trending; otherwise the shelves.
   */
  const typed = query.trim().length >= 2;
  const showResults = typed || loading;
  const showTrending = !showResults && focused;
  const browsing = !showResults && !showTrending;

  const groups: { title: string | null; items: Track[] }[] = showResults
    ? [{ title: null, items: tracks }]
    : showTrending
      ? [{ title: "Trending now", items: shelf.trending }].filter((g) => g.items.length > 0)
      : tab === "saved"
        // Filtered like the rest: a group holding no songs is not a group,
        // and left in it counted as content, so the "nothing saved yet"
        // notice never got its turn and the sheet closed up to nothing.
        ? [{ title: null, items: shelf.saved }].filter((g) => g.items.length > 0)
        // For you lays its own songs out above Browse, so there is nothing
        // left for the list underneath to draw.
        : [];

  /** How many songs For you offers before "See more". */
  const FOR_YOU_SHOWN = 4;
  const forYou = allForYou ? shelf.trending : shelf.trending.slice(0, FOR_YOU_SHOWN);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scrubTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setTracks([]);
      setSearched(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/music?q=${encodeURIComponent(q)}`);
        const json = await res.json();
        setTracks((json.tracks ?? []) as Track[]);
      } catch {
        setTracks([]);
      } finally {
        setSearched(true);
        setLoading(false);
        // Kept only once it ran, so every half-typed letter on the way to
        // a word does not become its own entry in the list.
        setRecent(rememberSearch(q));
      }
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [query, open]);

  // Reset + stop audio when the sheet closes. Only on an actual close: a
  // picker mounted closed (the Pages composer keeps one ready under the
  // spotlight) must not silence a song already playing somewhere else.
  const wasOpen = useRef(false);
  useEffect(() => {
    const closing = wasOpen.current && !open;
    wasOpen.current = open;
    if (!open) {
      if (closing) stopPreview();
      setQuery("");
      setTracks([]);
      setSearched(false);
      setSnippet(null);
      setMarked(null);
      setStart(0);
      setTab("foryou");
      setFocused(false);
      setAllRecent(false);
      setAllForYou(false);
    } else {
      setTimeout(() => inputRef.current?.focus(), 250);
    }
  }, [open]);

  function openSnippet(track: Track) {
    if (!pickPart) {
      stopPreview();
      onSelect(track);
      onClose();
      return;
    }
    stopPreview();
    setSnippet(track);
    setMarked(track.id);
    setStart(0);
  }

  /** Scrub → replay from the new spot (debounced so dragging doesn't stutter). */
  function scrub(next: number) {
    setStart(next);
    if (!snippet) return;
    clearTimeout(scrubTimer.current);
    scrubTimer.current = setTimeout(() => {
      ensurePreviewPlaying({ ...snippet, start: next || undefined }, { audible: true });
    }, 180);
  }

  function confirm() {
    if (!snippet) return;
    stopPreview();
    onSelect({ ...snippet, ...(start > 0 ? { start } : {}) });
    onClose();
  }

  const snippetPlaying = !!snippet && playingId === snippet.id;
  const { total, maxStart } = spanOf(snippet);

  // ── Snippet step ─────────────────────────────────────────────
  if (snippet) {
    return (
      <BottomSheet open={open} onClose={onClose} title="Pick the moment">
        <div className="flex min-h-[280px] flex-col gap-5 pb-4">
          <button
            type="button"
            onClick={() => { stopPreview(); setSnippet(null); }}
            className="flex items-center gap-1 self-start text-sm font-medium text-muted transition-colors hover:text-foreground"
          >
            <ChevronLeft size={16} /> Back to results
          </button>

          {/* The chosen track */}
          <div className="flex items-center gap-3">
            <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-surface">
              {snippet.artwork ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={snippet.artwork} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-faint"><Music size={18} /></span>
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{snippet.title}</p>
              <p className="truncate text-xs text-muted">{snippet.artist}</p>
            </div>
            <button
              type="button"
              aria-label={snippetPlaying ? "Pause" : "Play from selected point"}
              onClick={() =>
                snippetPlaying ? pausePreview() : ensurePreviewPlaying({ ...snippet, start: start || undefined }, { audible: true })
              }
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink transition-transform active:scale-95"
            >
              {snippetPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
            </button>
          </div>

          {/* Snippet window over the track.
              A waveform is only possible when there are audio bytes to decode.
              Spotify hands back a remote-controlled player instead, so those
              tracks get a plain timeline — which now spans the whole song
              rather than a 30-second preview. */}
          <div>
            <div className="flex items-baseline justify-between pb-2">
              <span className="text-xs font-bold uppercase tracking-widest text-faint">Plays</span>
              <span className="text-sm font-bold tabular-nums">
                {fmt(start)} – {fmt(Math.min(start + SNIPPET_LEN, total))}
              </span>
            </div>

            {snippet.preview ? (
              <Waveform
                src={snippet.preview}
                start={start}
                max={maxStart}
                duration={total}
                windowLen={SNIPPET_LEN}
                onChange={scrub}
              />
            ) : (
              <SnippetTimeline
                start={start}
                max={maxStart}
                duration={total}
                windowLen={SNIPPET_LEN}
                onChange={scrub}
              />
            )}

            <div className="flex justify-between pt-1 text-[10px] tabular-nums text-faint">
              <span>0:00</span>
              <span>{fmt(total)}</span>
            </div>
            <p className="pt-2 text-xs text-faint">
              {maxStart <= 0
                ? // A 30s window on a 30s iTunes preview leaves nothing to
                  // choose. Saying so beats a strip that silently refuses to
                  // move.
                  `This one is only ${fmt(total)} long, so all of it plays.`
                : `Drag the block anywhere on the track. Every snippet is ${SNIPPET_LEN} seconds.`}
            </p>
          </div>

          <button
            type="button"
            onClick={confirm}
            className="mt-auto flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-sm font-bold text-accent-ink transition-transform active:scale-[0.99]"
          >
            <Check size={16} /> Use this part
          </button>
        </div>
      </BottomSheet>
    );
  }

  // ── Search step ──────────────────────────────────────────────
  return (
    <BottomSheet open={open} onClose={onClose} title="Add a song">
      {/* Search field */}
      <div className="relative pb-3">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 -mt-1.5 text-faint" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          placeholder="Search songs or artists…"
          className="input pl-10 pr-10"
        />
        {(query || focused) && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              setFocused(false);
              inputRef.current?.blur();
            }}
            className="absolute right-3 top-1/2 -mt-1.5 -translate-y-1/2 text-faint transition-colors hover:text-foreground"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {browsing && (
        <div className="pb-1">
          {/* Two halves: what to play, and what you kept. */}
          <div className="flex rounded-[13px] bg-surface p-[3px]" role="tablist" aria-label="Songs">
            {([["foryou", "For you"], ["saved", "Saved"]] as const).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`flex-1 rounded-[10px] py-1.5 text-xs font-bold transition-colors ${
                  tab === k ? "bg-elevated text-foreground" : "text-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "foryou" && (
            <>
              {recent.length > 0 && (
                <>
                  <div className="flex items-center justify-between px-1 pb-1 pt-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-faint">Recent</p>
                    {recent.length > RECENT_SHOWN ? (
                      <button
                        type="button"
                        onClick={() => setAllRecent((v) => !v)}
                        className="text-[11px] font-semibold text-accent"
                      >
                        {allRecent ? "Show less" : "See more"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setRecent(forgetSearches())}
                        className="text-[11px] font-semibold text-faint"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  {(allRecent ? recent : recent.slice(0, RECENT_SHOWN)).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setQuery(q)}
                      className="flex w-full items-center gap-2.5 rounded-xl px-1 py-2 text-left transition-colors hover:bg-white/[0.04]"
                    >
                      <Clock size={14} className="shrink-0 text-faint" />
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground/85">{q}</span>
                    </button>
                  ))}
                </>
              )}

              {forYou.length > 0 && (
                <>
                  <div className="flex items-center justify-between px-1 pb-1 pt-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-faint">For you</p>
                    {shelf.trending.length > FOR_YOU_SHOWN && (
                      <button
                        type="button"
                        onClick={() => setAllForYou((v) => !v)}
                        className="text-[11px] font-semibold text-accent"
                      >
                        {allForYou ? "Show less" : "See more"}
                      </button>
                    )}
                  </div>
                  {forYou.map((t) => (
                    <SongRow
                      key={t.id}
                      track={t}
                      playing={playingId === t.id}
                      marked={marked === t.id}
                      onPick={() => openSnippet(t)}
                    />
                  ))}
                </>
              )}

              <p className="px-1 pb-1.5 pt-3 text-xs font-bold uppercase tracking-widest text-faint">Browse</p>
              <div className="grid grid-cols-2 gap-2">
                {SOUND_CATEGORIES.map((c, i) => {
                  // Real artwork, faint, under the colour. There are no
                  // category pictures to ship and inventing six would date
                  // badly; what is being played on Hypefy is already here,
                  // changes on its own, and reads as texture at this size.
                  const art = shelf.trending[i % Math.max(1, shelf.trending.length)]?.artwork;
                  return (
                    <button
                      key={c.label}
                      type="button"
                      onClick={() => setQuery(c.query)}
                      className="relative flex h-[62px] items-end overflow-hidden rounded-[14px] px-3 pb-2 text-left text-[13px] font-bold text-accent-ink transition-transform active:scale-[0.97]"
                      style={{ background: `linear-gradient(135deg, ${c.from}, ${c.to})` }}
                    >
                      {art && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={art}
                          alt=""
                          aria-hidden
                          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-20 mix-blend-overlay"
                        />
                      )}
                      <span className="relative">{c.label}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* For you brings its own height in the grid above; everything else
          holds the sheet open so it does not snap shut between states. */}
      <div className={`flex flex-col pb-2 ${browsing && tab === "foryou" ? "" : "min-h-[280px]"}`}>
        {loading ? (
          <div className="flex flex-col gap-1 pt-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-2">
                <div className="skeleton h-11 w-11 shrink-0 rounded-lg" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="skeleton h-3 rounded" style={{ width: `${50 + (i % 3) * 15}%` }} />
                  <div className="skeleton h-2.5 w-20 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : groups.length > 0 ? (
          <div className="flex flex-col">
            {groups.map((g) => (
              <Fragment key={g.title ?? "results"}>
                {g.title && (
                  <p data-shelf-heading className="px-1 pb-1 pt-3 text-xs font-bold uppercase tracking-widest text-faint first:pt-0">
                    {g.title}
                  </p>
                )}
            {g.items.map((t) => (
              <SongRow
                key={t.id}
                track={t}
                playing={playingId === t.id}
                marked={marked === t.id}
                onPick={() => openSnippet(t)}
              />
            ))}
              </Fragment>
            ))}
          </div>
        ) : showResults && searched ? (
          <EmptyState icon={Music} title="No songs found" text="Try a different title or artist." variant="compact" />
        ) : browsing && tab === "saved" ? (
          <EmptyState
            icon={Music}
            title="Nothing saved yet"
            text="Save a sound from a Shot and it waits here."
            variant="compact"
          />
        ) : browsing ? (
          // For you lays out songs and a grid of its own, so there is
          // nothing missing to announce — a "search for a song" notice
          // below a full page of things to tap reads as a page that failed.
          <p className="px-1 pb-1 pt-3 text-center text-[11px] text-faint">
            30-second previews provided by Apple Music
          </p>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
            <Music size={28} className="text-faint" />
            <p className="text-sm text-muted">Search for a song to attach</p>
            <p className="text-xs text-faint">30-second previews provided by Apple Music</p>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
