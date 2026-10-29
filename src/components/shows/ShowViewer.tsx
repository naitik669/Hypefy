"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  Star,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  MoreHorizontal,
  Trash2,
  Bookmark,
  BookmarkCheck,
  Loader2,
  FileText,
  Eye,
  Flag,
  Ban,
} from "lucide-react";
import { SendIcon } from "@/components/ui/ShareIcon";
import { shieldProps } from "@/lib/overlay-shield";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { ShowViewersSheet } from "@/components/shows/ShowViewersSheet";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  parseTrack,
  ensurePreviewPlaying,
  pausePreview,
  stopPreview,
} from "@/lib/music";
import { useToast } from "@/components/ui/ToastProvider";
import { hypeResult } from "@/lib/supabase/typed";
import { ReportSheet } from "@/components/ui/ReportSheet";
import { safeBack } from "@/lib/safe-back";
import { scheduleUndoable } from "@/lib/undoable";

type ShowProfile = {
  display_name: string | null;
  avatar_hue: number | null;
  username: string | null;
  avatar_url?: string | null;
} | null;

type LinkedPost = {
  id: string;
  caption: string | null;
  image_url: string | null;
  image_urls?: string[] | null;
  profiles: {
    display_name: string | null;
    username: string | null;
    avatar_hue: number | null;
    avatar_url?: string | null;
  } | null;
} | null;

export type ShowItem = {
  id: string;
  user_id: string;
  media_url: string | null;
  caption: string | null;
  created_at: string;
  hype_count?: number;
  is_showcase?: boolean;
  linked_post_id?: string | null;
  linked_post?: LinkedPost;
  profiles: ShowProfile;
  /** Attached song ({id,title,artist,artwork,preview} jsonb) — see src/lib/music. */
  track?: unknown;
  /** What is arranged on top of the picture — see src/lib/show-layers. */
  layers?: unknown;
};

import { showDurationMs, showMediaKind } from "@/lib/show-media";
import { isVideoUrl } from "@/lib/video-mime";
import { BLANK_POSTER } from "@/lib/blank-poster";
import { readLayers } from "@/lib/show-layers";
import { LayerStack } from "@/components/shows/LayerView";
import type { PollState } from "@/components/shows/ShowPoll";
import { storyGesture, storyKey, type StoryMove } from "@/lib/story-gesture";

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function ShowViewer({
  shows,
  startIdx = 0,
  currentUserId,
  hideMenu = false,
}: {
  shows: ShowItem[];
  startIdx?: number;
  currentUserId: string | null;
  /**
   * Drops the ⋯ menu entirely.
   *
   * Set when playing a Showcase board, where the items are references to
   * content that lives elsewhere. Every action in that menu acts on a row in
   * `shows` — delete, and the showcase toggle — so on a board entry it would
   * either operate on something the viewer did not think they were touching,
   * or, for an uploaded item that has no `shows` row at all, silently do
   * nothing. Managing a board belongs to the board.
   */
  hideMenu?: boolean;
}) {
  const router = useRouter();
  const [idx, setIdx] = useState(startIdx);
  const [showcasedIds, setShowcasedIds] = useState<Set<string>>(
    () => new Set(shows.filter((s) => s.is_showcase).map((s) => s.id))
  );

  const show = shows[idx];
  if (!show) return null;

  function goNext() {
    if (idx < shows.length - 1) setIdx((i) => i + 1);
    else safeBack(router);
  }
  function goPrev() {
    if (idx > 0) setIdx((i) => i - 1);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black" {...shieldProps}>
      <ShowScreen
        key={show.id}
        show={show}
        total={shows.length}
        idx={idx}
        currentUserId={currentUserId}
        hideMenu={hideMenu}
        isShowcase={showcasedIds.has(show.id)}
        onShowcaseToggle={(id, val) =>
          setShowcasedIds((prev) => {
            const next = new Set(prev);
            val ? next.add(id) : next.delete(id);
            return next;
          })
        }
        onNext={goNext}
        onPrev={goPrev}
        onClose={() => safeBack(router)}
      />
    </div>
  );
}

function ShowScreen({
  show,
  total,
  idx,
  currentUserId,
  hideMenu = false,
  isShowcase,
  onShowcaseToggle,
  onNext,
  onPrev,
  onClose,
}: {
  show: ShowItem;
  total: number;
  idx: number;
  currentUserId: string | null;
  hideMenu?: boolean;
  isShowcase: boolean;
  onShowcaseToggle: (id: string, val: boolean) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const showToast = useToast();
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  /** The video's own length, once it knows it. Null for a photo, and
   *  until metadata arrives. */
  const [mediaSecs, setMediaSecs] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [reply, setReply] = useState("");
  const rafRef = useRef<number>(0);
  const progressRef = useRef(0);

  const [menuOpen, setMenuOpen] = useState(false);
  const [viewerMenuOpen, setViewerMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);

  async function blockAuthor() {
    setConfirmBlock(false);
    const { error } = await supabase.rpc("block_user", {
      p_blocked: show.user_id,
    });
    if (error) {
      showToast(error.message ?? "Couldn't block, try again");
      setPaused(false);
      return;
    }
    showToast("Blocked");
    // Leave the Show rather than sitting inside content from someone you
    // just blocked.
    onClose();
    router.refresh();
  }
  const [viewersOpen, setViewersOpen] = useState(false);
  const [actionPending, setActionPending] = useState<
    "delete" | "showcase" | null
  >(null);

  const isOwner = !!currentUserId && currentUserId === show.user_id;
  const name = show.profiles?.display_name ?? show.profiles?.username ?? "User";
  const hue = show.profiles?.avatar_hue ?? 280;

  const [hyped, setHyped] = useState(false);
  const [hypeCount, setHypeCount] = useState(show.hype_count ?? 0);
  const [hypePending, setHypePending] = useState(false);
  const [viewCount, setViewCount] = useState<number | null>(null);
  const [sendingReply, setSendingReply] = useState(false);
  const [replyStatus, setReplyStatus] = useState<"idle" | "sent" | "error">(
    "idle"
  );
  const [replyError, setReplyError] = useState<string | null>(null);

  // Server-side view tracking: viewers register a view, owners see the count
  useEffect(() => {
    if (!currentUserId) return;
    if (isOwner) {
      supabase
        .from("show_views")
        .select("viewer_id", { count: "exact", head: true })
        .eq("show_id", show.id)
        .then(({ count }) => setViewCount(count ?? 0));
    } else {
      supabase
        .from("show_views")
        .upsert(
          { show_id: show.id, viewer_id: currentUserId },
          { onConflict: "show_id,viewer_id", ignoreDuplicates: true }
        )
        .then(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show.id, currentUserId, isOwner]);

  const showTrack = parseTrack(show.track);

  // Song on the Show: plays while this screen is up, pauses with the story
  // timer (hold / menus / sheets), and stops when the screen unmounts.
  useEffect(() => {
    if (!showTrack) return;
    if (paused || menuOpen || viewersOpen) {
      pausePreview();
    } else {
      ensurePreviewPlaying(showTrack);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTrack?.id, paused, menuOpen, viewersOpen]);
  useEffect(() => () => stopPreview(), []);

  const linkedPost = show.linked_post ?? null;
  const postAuthorName =
    linkedPost?.profiles?.display_name ??
    linkedPost?.profiles?.username ??
    "User";
  const postAuthorHue = linkedPost?.profiles?.avatar_hue ?? 280;

  // The specific image selected for the embed (stored in media_url for linked-post shots)
  const embedImage = show.linked_post_id ? show.media_url : null;
  const hasEmbedImage = !!embedImage;

  useEffect(() => {
    let active = true;
    async function loadHype() {
      if (!currentUserId) return;
      const [mine, totals] = await Promise.all([
        supabase
          .from("hypes")
          .select("id")
          .eq("user_id", currentUserId)
          .eq("target_type", "show")
          .eq("target_id", show.id)
          .maybeSingle(),
        supabase
          .from("shows")
          .select("hype_count")
          .eq("id", show.id)
          .maybeSingle(),
      ]);
      if (!active) return;
      setHyped(!!mine.data);
      if (totals.data) setHypeCount(totals.data.hype_count ?? 0);
    }
    loadHype();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show.id, currentUserId]);

  async function toggleShowHype() {
    if (hypePending || !currentUserId) return;
    const prev = hyped,
      prevCount = hypeCount;
    setHypePending(true);
    setHyped(!prev);
    setHypeCount((c) => c + (prev ? -1 : 1));
    try {
      const { data, error } = await supabase.rpc("toggle_hype", {
        p_target_type: "show",
        p_target_id: show.id,
        p_owner_id: show.user_id,
      });
      if (error) throw error;
      const res = hypeResult(data);
      if (res) {
        setHyped(res.hyped);
        setHypeCount(res.hype_count);
      }
    } catch {
      setHyped(prev);
      setHypeCount(prevCount);
    } finally {
      setHypePending(false);
    }
  }

  /**
   * Send a Show reply as a DM to the owner. Without a show_id column on
   * messages, we prefix a context line so the chat reads like a story reply.
   */
  async function sendReply() {
    const text = reply.trim();
    if (!text || sendingReply || !currentUserId || isOwner) return;
    setSendingReply(true);
    setReplyError(null);

    const { data: convId, error: convErr } = await supabase.rpc(
      "get_or_create_dm",
      { p_other: show.user_id }
    );
    if (convErr || !convId) {
      setSendingReply(false);
      setReplyStatus("error");
      setReplyError(
        convErr?.message?.includes("dm_restricted")
          ? "They only accept DMs from people they follow"
          : convErr?.message?.includes("blocked")
          ? "Can't reply to this account"
          : "Couldn't send reply"
      );
      setTimeout(() => {
        setReplyStatus("idle");
        setReplyError(null);
      }, 2600);
      return;
    }

    const body = `↩️ Replied to your Show: ${text}`;
    const { error: sendErr } = await supabase.rpc("send_message", {
      p_conversation_id: convId,
      p_body: body,
      p_kind: "text",
      p_post_id: undefined,
      p_reply_to_id: undefined,
      p_shot_id: undefined,
    });

    setSendingReply(false);
    if (sendErr) {
      setReplyStatus("error");
      setReplyError("Couldn't send reply");
      setTimeout(() => {
        setReplyStatus("idle");
        setReplyError(null);
      }, 2600);
      return;
    }
    setReply("");
    setReplyStatus("sent");
    setTimeout(() => setReplyStatus("idle"), 2200);
  }

  function deleteShow() {
    // Deferred, not reversed: a Show is a hard-deleted row, so the only undo
    // that tells the truth is one that stops the delete from happening. The
    // viewer closes at once; the row goes in five seconds unless Undo.
    setMenuOpen(false);
    onClose();

    const cancel = scheduleUndoable(async () => {
      const { error } = await supabase.from("shows").delete().eq("id", show.id);
      if (error) {
        showToast("Couldn't delete that Show. Try again.");
        return;
      }
      router.refresh();
    });

    const isVideo = isVideoUrl(show.media_url);
    showToast("Show deleted", "plain", {
      label: "Undo",
      detail: show.caption?.trim() || "Your Show",
      thumb: { src: isVideo ? null : show.media_url ?? null, name: show.caption ?? "Show" },
      onClick: () => {
        cancel();
        router.refresh();
      },
    });
  }

  async function toggleShowcase() {
    setActionPending("showcase");
    const next = !isShowcase;
    const { error } = await supabase
      .from("shows")
      .update({ is_showcase: next })
      .eq("id", show.id);
    setActionPending(null);
    if (error) {
      showToast("Couldn't update your showcase. Try again.");
      return;
    }
    onShowcaseToggle(show.id, next);
    setMenuOpen(false);
  }

  useEffect(() => {
    progressRef.current = 0;
    setProgress(0);
    setMediaSecs(null);
  }, [show.id]);

  /**
   * The frame the layers are placed in.
   *
   * Positions are fractions, so they need a real width and height to
   * become pixels. Measured rather than assumed: this screen is a phone
   * most of the time and a centred column on a desktop.
   */
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [frameSize, setFrameSize] = useState({ width: 390, height: 844 });

  useEffect(() => {
    const el = frameRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const seen = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setFrameSize({ width, height });
    });
    seen.observe(el);
    return () => seen.disconnect();
  }, []);

  const layers = useMemo(() => readLayers(show.layers), [show.layers]);

  /**
   * What the server knows about this Show's polls.
   *
   * One call for the whole Show rather than one per poll, and nothing
   * at all when it carries none — most Shows do not.
   */
  const [polls, setPolls] = useState<Record<string, PollState>>({});
  const hasPoll = useMemo(() => layers.some((l) => l.type === "poll"), [layers]);

  useEffect(() => {
    if (!hasPoll) return;
    let dropped = false;
    void supabase
      .rpc("show_poll_tallies", { p_show_id: show.id })
      .then(({ data }) => {
        if (dropped || !data) return;
        setPolls(data as Record<string, PollState>);
      });
    return () => {
      dropped = true;
    };
  }, [show.id, hasPoll, supabase]);

  const kind = showMediaKind(show.media_url);
  const duration = showDurationMs(show.media_url, mediaSecs);

  /**
   * The video follows the story clock rather than running on its own.
   *
   * A tap-and-hold pauses the bar; it has to pause the picture too, or the
   * clip plays on silently behind a frozen progress bar and the two are
   * describing different moments.
   */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (paused || menuOpen || viewersOpen) {
      v.pause();
      return;
    }
    const tryPlay = v.play();
    if (!tryPlay) return;
    tryPlay.catch((err: unknown) => {
      // Only autoplay refusal is worth answering. Anything else — a
      // missing file, a codec the device will not take — is a broken
      // Show, and muting it would not help.
      if ((err as { name?: string })?.name !== "NotAllowedError") return;
      v.muted = true;
      void v.play().catch(() => {});
    });
  }, [show.id, paused, menuOpen, viewersOpen]);

  useEffect(() => {
    if (paused || menuOpen || viewersOpen) return;
    const lastP = progressRef.current;
    let base = 0;
    function tick(now: number) {
      if (base === 0) base = now - lastP * duration;
      const p = Math.min((now - base) / duration, 1);
      progressRef.current = p;
      setProgress(p);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else onNext();
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [show.id, paused, menuOpen, viewersOpen, duration, onNext]);

  /**
   * One place where a press turns into a move.
   *
   * Holding pauses the clock the moment the finger lands, so a long look
   * at somebody's photo does not run out underneath them; letting go
   * un-pauses whatever the press turned out to mean.
   */
  const press = useRef<{ x: number; y: number; t: number } | null>(null);

  function act(move: StoryMove) {
    if (move === "next") onNext();
    else if (move === "prev") onPrev();
    else if (move === "close") onClose();
  }

  function onPressDown(e: React.PointerEvent) {
    press.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    setPaused(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onPressUp(e: React.PointerEvent) {
    const from = press.current;
    press.current = null;
    setPaused(false);
    if (!from) return;
    const box = e.currentTarget.getBoundingClientRect();
    act(
      storyGesture({
        dx: e.clientX - from.x,
        dy: e.clientY - from.y,
        ms: performance.now() - from.t,
        x: e.clientX - box.left,
        width: box.width,
      }),
    );
  }

  function onPressCancel() {
    press.current = null;
    setPaused(false);
  }

  // Arrow keys and Escape, which this screen never had.
  useEffect(() => {
    if (menuOpen || viewersOpen) return;
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      // Not while somebody is writing a reply: Escape should leave the
      // field, and an arrow key should move the caret.
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      const move = storyKey(e.key);
      if (!move) return;
      e.preventDefault();
      if (move === "next") onNext();
      else if (move === "prev") onPrev();
      else onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen, viewersOpen, onNext, onPrev, onClose]);

  function openLinkedPost() {
    if (!linkedPost) return;
    setPaused(true);
    router.push(`/p/${linkedPost.id}`);
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {/* ── Background ── */}
      {show.linked_post_id ? (
        // Post-share shot: blurred image or dark gradient
        hasEmbedImage ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={embedImage!}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full scale-110 object-cover blur-3xl"
              style={{ opacity: 0.35 }}
            />
            <div className="absolute inset-0 bg-black/60" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#0d0d1e] via-[#111128] to-[#08080f]" />
        )
      ) : kind === "video" ? (
        // A video Show. The picker has always accepted one and the bucket
        // has always stored it; only the viewer insisted on an <img>.
        <video
          ref={videoRef}
          poster={BLANK_POSTER}
          src={show.media_url ?? undefined}
          className="absolute inset-0 h-full w-full object-cover"
          playsInline
          autoPlay
          onLoadedMetadata={(e) => setMediaSecs(e.currentTarget.duration)}
          aria-label={show.caption ?? "Show"}
        />
      ) : show.media_url ? (
        // Normal shot: full-bleed image
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={show.media_url}
          alt={show.caption ?? "Show"}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-accent/40 to-[hsl(280deg_80%_20%)]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />

      {/* What was arranged on top of the picture. Above the scrim so the
          words stay readable, below the chrome and the gesture surface so
          a tap still moves between Shows — only a layer that is really
          something to press takes the press, and LayerView decides that
          per layer rather than the stack claiming the whole frame. */}
      <div ref={frameRef} className="pointer-events-none absolute inset-0 z-[5]">
        <LayerStack layers={layers} frame={frameSize} showId={show.id} polls={polls} />
      </div>

      {/* ── The gesture surface ──
          Two tap zones became one. Diary's player has had tap, swipe
          between people, swipe down to leave and hold-to-pause since it
          shipped; this had the two zones and no way out but the X. The
          inset keeps the chrome above and below clickable. */}
      {!menuOpen && (
        <div
          className="absolute inset-x-0 z-10"
          style={{ top: 88, bottom: 88, touchAction: "none" }}
          onPointerDown={onPressDown}
          onPointerUp={onPressUp}
          onPointerCancel={onPressCancel}
        />
      )}

      {/* ── Progress bars ── */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-20 flex gap-1 px-3 pt-3">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/25"
          >
            <div
              className="h-full rounded-full bg-white"
              style={{
                width:
                  i < idx ? "100%" : i === idx ? `${progress * 100}%` : "0%",
                transition: "none",
              }}
            />
          </div>
        ))}
      </div>

      {/* ── Header ── */}
      <div className="pointer-events-none absolute left-0 right-0 top-8 z-20 flex items-center gap-3 px-3 pt-1">
        <Avatar
          name={name}
          hue={hue}
          size={36}
          src={show.profiles?.avatar_url ?? undefined}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-bold text-white drop-shadow">
            {name}
          </span>
          <span className="text-xs text-white/55">
            {timeAgo(show.created_at)}
          </span>
        </div>

        {/* Was owner-only, so someone watching a stranger's Show had no menu
            at all and no way to report it. A Show is ephemeral, which makes
            it the easiest thing here to misuse and the hardest to moderate
            after the fact — it should not have been the one surface with no
            way to raise a hand. */}
        {!hideMenu && (
          <button
            type="button"
            aria-label={isOwner ? "Show options" : "Report or block"}
            onClick={(e) => {
              e.stopPropagation();
              setPaused(true);
              if (isOwner) setMenuOpen(true);
              else setViewerMenuOpen(true);
            }}
            className="pointer-events-auto flex h-8 w-8 items-center justify-center text-white"
          >
            <MoreHorizontal size={22} />
          </button>
        )}

        <button
          type="button"
          aria-label="Close"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="pointer-events-auto flex h-8 w-8 items-center justify-center text-white"
        >
          <X size={22} />
        </button>
      </div>

      {/* ── Nav arrows ── */}
      {idx > 0 && !menuOpen && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPrev();
          }}
          aria-label="Previous Show"
          className="pointer-events-auto absolute left-2 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm"
        >
          <ChevronLeft size={22} />
        </button>
      )}
      {idx < total - 1 && !menuOpen && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
          aria-label="Next Show"
          className="pointer-events-auto absolute right-2 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm"
        >
          <ChevronRight size={22} />
        </button>
      )}

      {/* ── Hypefy Post Embed Card ── */}
      {show.linked_post_id && !menuOpen && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openLinkedPost();
          }}
          className="pointer-events-auto absolute inset-x-6 z-30 overflow-hidden rounded-2xl border border-white/[0.12] bg-black/50 shadow-2xl backdrop-blur-2xl transition-transform active:scale-[0.97]"
          style={{ top: "17%", maxHeight: "60%" }}
        >
          {linkedPost ? (
            <>
              {/* Author row */}
              <div className="flex items-center gap-2.5 px-3.5 py-3">
                <Avatar
                  name={postAuthorName}
                  hue={postAuthorHue}
                  size={26}
                  src={linkedPost.profiles?.avatar_url ?? undefined}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold leading-tight text-white">
                    {postAuthorName}
                  </p>
                  {linkedPost.profiles?.username && (
                    <p className="truncate text-[10px] text-white/45">
                      @{linkedPost.profiles.username}
                    </p>
                  )}
                </div>
                {/* Hypefy badge */}
                <span className="shrink-0 rounded-full border border-white/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white/50">
                  Hypefy
                </span>
              </div>

              {/* Divider */}
              <div className="h-px bg-white/[0.08]" />

              {/* Post image OR text preview */}
              {hasEmbedImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={embedImage!}
                  alt="Post"
                  className="w-full object-cover"
                  style={{ maxHeight: "52vw" }}
                />
              ) : (
                <div className="flex min-h-[80px] items-center justify-center bg-white/[0.04] px-4 py-5">
                  {linkedPost.caption ? (
                    <p className="line-clamp-4 text-center text-sm leading-snug text-white/75">
                      {linkedPost.caption}
                    </p>
                  ) : (
                    <FileText size={28} className="text-white/20" />
                  )}
                </div>
              )}

              {/* Caption snippet (only when image is shown) */}
              {hasEmbedImage && linkedPost.caption && (
                <>
                  <div className="h-px bg-white/[0.08]" />
                  <p className="line-clamp-2 px-3.5 py-2.5 text-[12px] leading-snug text-white/70">
                    {linkedPost.caption}
                  </p>
                </>
              )}

              {/* Footer CTA */}
              <div className="flex items-center justify-between border-t border-white/[0.08] px-3.5 py-2.5">
                <span className="text-[11px] font-semibold text-white/40">
                  Tap to view post
                </span>
                <ExternalLink size={13} className="text-white/40" />
              </div>
            </>
          ) : (
            /* Post deleted / not loaded */
            <div className="flex items-center justify-center gap-2 px-4 py-6">
              <FileText size={18} className="text-white/30" />
              <span className="text-sm text-white/40">
                Post no longer available
              </span>
            </div>
          )}
        </button>
      )}

      {/* ── Song pill ── */}
      {showTrack && !menuOpen && (
        <div
          className="pointer-events-none absolute right-4 z-20 flex max-w-[60%] items-center gap-2 rounded-pill bg-black/50 py-1 pl-1 pr-3 backdrop-blur-sm"
          style={{ bottom: show.caption ? 128 : 96 }}
        >
          {showTrack.artwork ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={showTrack.artwork}
              alt=""
              className={`h-6 w-6 shrink-0 rounded-full object-cover ${
                paused ? "" : "animate-[spin_4s_linear_infinite]"
              }`}
            />
          ) : (
            <span className="flex h-6 w-6 shrink-0 items-center justify-center text-white/80">
              ♪
            </span>
          )}
          <p className="min-w-0 truncate text-[11px] font-semibold text-white/90">
            {showTrack.title}
            {showTrack.artist && (
              <span className="font-normal text-white/55">
                {" "}
                · {showTrack.artist}
              </span>
            )}
          </p>
        </div>
      )}

      {/* ── Caption ── */}
      {show.caption && !menuOpen && (
        <div
          className="pointer-events-none absolute inset-x-4 z-20"
          style={{ bottom: 96 }}
        >
          <p className="text-sm text-white/90 drop-shadow">{show.caption}</p>
        </div>
      )}

      {/* ── Owner view count → opens the viewers list ── */}
      {isOwner && viewCount !== null && !menuOpen && (
        <div
          className="absolute left-4 z-20 flex items-center gap-1.5"
          style={{ bottom: show.caption ? 128 : 96 }}
        >
          <button
            type="button"
            aria-label="See who viewed"
            onClick={(e) => {
              e.stopPropagation();
              setViewersOpen(true);
            }}
            className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 backdrop-blur-sm transition-transform active:scale-95"
          >
            <Eye size={13} className="text-white/80" />
            <span className="text-xs font-semibold text-white/90">
              {viewCount} {viewCount === 1 ? "view" : "views"}
            </span>
          </button>
        </div>
      )}

      {isOwner && (
        <ShowViewersSheet
          open={viewersOpen}
          onClose={() => setViewersOpen(false)}
          showId={show.id}
          ownerId={show.user_id}
        />
      )}

      {/* ── Reply + Hype bar (viewers only) ── */}
      {!menuOpen && !isOwner && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/70 to-transparent px-3 pb-6 pt-12">
          {/* Sent / error feedback */}
          {replyStatus !== "idle" && (
            <div className="pointer-events-none mb-2 flex justify-center">
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold backdrop-blur-sm ${
                  replyStatus === "sent"
                    ? "bg-accent/90 text-accent-ink"
                    : "bg-black/60 text-white"
                }`}
              >
                {replyStatus === "sent"
                  ? "Reply sent ⚡"
                  : replyError ?? "Couldn't send reply"}
              </span>
            </div>
          )}
          <div className="pointer-events-auto flex items-center gap-3">
            <input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onClick={(e) => {
                e.stopPropagation();
                setPaused(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  sendReply();
                }
              }}
              onBlur={() => setPaused(false)}
              placeholder={`Reply to ${name}…`}
              disabled={sendingReply}
              className="h-11 flex-1 rounded-pill border border-white/25 bg-white/10 px-4 text-sm text-white outline-none backdrop-blur-sm placeholder:text-white/45 disabled:opacity-60 focus:ring-1 focus:ring-white/30"
            />
            <button
              type="button"
              aria-label="Hype this Show"
              disabled={hypePending}
              onClick={(e) => {
                e.stopPropagation();
                toggleShowHype();
              }}
              className="flex flex-col items-center gap-0.5 transition-transform active:scale-90 disabled:opacity-60"
            >
              <Star
                size={28}
                className={`transition-colors ${
                  hyped ? "text-hype" : "text-white"
                }`}
                fill={hyped ? "currentColor" : "none"}
              />
              {hypeCount > 0 && (
                <span className="text-[11px] font-semibold tabular-nums text-white">
                  {hypeCount}
                </span>
              )}
            </button>
            <button
              type="button"
              aria-label="Send reply"
              disabled={!reply.trim() || sendingReply}
              onClick={(e) => {
                e.stopPropagation();
                sendReply();
              }}
              className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-accent text-accent-ink transition-transform active:scale-90 disabled:opacity-40"
            >
              {sendingReply ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <SendIcon size={18} weight="fill" />
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── Viewer actions: report the Show, or block whoever posted it ── */}
      {viewerMenuOpen && (
        <>
          <div
            className="absolute inset-0 z-40"
            onClick={() => {
              setViewerMenuOpen(false);
              setPaused(false);
            }}
          />
          <div className="absolute inset-x-4 bottom-8 z-50 overflow-hidden rounded-2xl bg-elevated/95 ring-1 ring-border backdrop-blur-xl">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setViewerMenuOpen(false);
                setReportOpen(true);
              }}
              className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-white/5"
            >
              <Flag size={20} className="text-foreground" />
              <div>
                <p className="text-sm font-semibold">Report Show</p>
                <p className="text-xs text-muted">
                  Tell us what&rsquo;s wrong with this
                </p>
              </div>
            </button>

            <div className="mx-4 h-px bg-border" />

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setViewerMenuOpen(false);
                setConfirmBlock(true);
              }}
              className="flex w-full items-center gap-3 px-5 py-4 text-left text-danger transition-colors hover:bg-danger/10"
            >
              <Ban size={20} />
              <div>
                <p className="text-sm font-semibold">Block {name}</p>
                <p className="text-xs opacity-70">You stop seeing each other</p>
              </div>
            </button>

            <div className="mx-4 h-px bg-border" />

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setViewerMenuOpen(false);
                setPaused(false);
              }}
              className="flex w-full items-center justify-center px-5 py-4 text-sm font-semibold text-muted transition-colors hover:bg-white/5"
            >
              Cancel
            </button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmBlock}
        onClose={() => {
          setConfirmBlock(false);
          setPaused(false);
        }}
        onConfirm={blockAuthor}
        icon={Ban}
        title={`Block ${name}`}
        body="Their Shows and posts disappear from your feeds, and yours from theirs. They aren't told."
        confirmLabel="Block"
      />

      {currentUserId && reportOpen && (
        <ReportSheet
          open
          onClose={() => {
            setReportOpen(false);
            setPaused(false);
          }}
          targetType="show"
          targetId={show.id}
          currentUserId={currentUserId}
        />
      )}

      {/* ── Owner actions menu ── */}
      {menuOpen && (
        <>
          <div
            className="absolute inset-0 z-40"
            onClick={() => {
              setMenuOpen(false);
              setPaused(false);
            }}
          />
          <div className="absolute inset-x-4 bottom-8 z-50 overflow-hidden rounded-2xl bg-elevated/95 backdrop-blur-xl ring-1 ring-border">
            {/* Showcase toggle */}
            <button
              type="button"
              disabled={actionPending !== null}
              onClick={toggleShowcase}
              className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-white/5 disabled:opacity-50"
            >
              {actionPending === "showcase" ? (
                <Loader2 size={20} className="animate-spin text-accent" />
              ) : isShowcase ? (
                <BookmarkCheck size={20} className="text-accent" />
              ) : (
                <Bookmark size={20} className="text-foreground" />
              )}
              <div>
                <p className="text-sm font-semibold">
                  {isShowcase ? "Remove from Showcase" : "Add to Showcase"}
                </p>
                <p className="text-xs text-muted">
                  {isShowcase
                    ? "Remove from your profile highlights"
                    : "Pin permanently to your profile"}
                </p>
              </div>
            </button>

            <div className="mx-4 h-px bg-border" />

            {/* Delete */}
            <button
              type="button"
              disabled={actionPending !== null}
              onClick={deleteShow}
              className="flex w-full items-center gap-3 px-5 py-4 text-left text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
            >
              <Trash2 size={20} />
              <div>
                <p className="text-sm font-semibold">Delete Show</p>
                <p className="text-xs opacity-70">
                  You get 5 seconds to undo
                </p>
              </div>
            </button>

            <div className="mx-4 h-px bg-border" />

            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setPaused(false);
              }}
              className="flex w-full items-center justify-center px-5 py-4 text-sm font-semibold text-muted transition-colors hover:bg-white/5"
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
