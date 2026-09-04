"use client";

import { useEffect, useRef, useState } from "react";
import { Link2, Tv, Repeat2, Check, Search, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/ToastProvider";

type Friend = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_hue: number | null;
  /** The query has always fetched this; the type omitted it, so the cast to
   *  Friend[] hid it from the renderer and everyone showed as a gradient
   *  initial instead of their actual photo. */
  avatar_url: string | null;
  /** Closeness bucket — see `rank` below. 4 means "not a connection". */
  tier?: number;
};

/**
 * Below this many real connections, the list is topped up with people you
 * have merely interacted with. Above it, it is connections only.
 *
 * Worth knowing what this does at current scale: every account today has
 * fewer than this, so the top-up still applies to everybody and the list does
 * not actually get shorter. What changes now is the ORDER, and the divider
 * that makes the boundary visible — which is the honest fix while the whole
 * app is small enough that most people have brushed against most others.
 */
const THIN_CONNECTIONS = 8;

export function ShareSheet({
  open,
  onClose,
  postId,
  targetType = "post",
  /** All image URLs for the post (enables square picker + index badge) */
  imageUrls,
  /** Which image was visible when share was opened — pre-selects that slot */
  initialImageIdx = 0,
}: {
  open: boolean;
  onClose: () => void;
  postId: string;
  targetType?: "post" | "shot";
  imageUrls?: string[];
  initialImageIdx?: number;
}) {
  const supabase = createClient();
  const showToast = useToast();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [reposted, setReposted] = useState(false);
  const [addingShow, setAddingShow] = useState(false);
  const [showAdded, setShowAdded] = useState(false);
  const [sendingDm, setSendingDm] = useState(false);
  const [dmDone, setDmDone] = useState(false);

  // Which image slot is selected for the Shot embed
  const [selectedIdx, setSelectedIdx] = useState(initialImageIdx);
  const imgSwipeStartX = useRef(0);

  // Reset selected index when sheet opens with a new post/image
  useEffect(() => {
    if (open) setSelectedIdx(initialImageIdx);
  }, [open, initialImageIdx]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const [followingRes, followerRes, hyperRes, notifRes] = await Promise.all([
        supabase.from("follows").select("following_id").eq("follower_id", user.id).limit(100),
        supabase.from("follows").select("follower_id").eq("following_id", user.id).limit(100),
        supabase.from("close_friends").select("friend_id").eq("user_id", user.id).limit(100),
        supabase.from("notifications")
          .select("actor_id")
          .eq("user_id", user.id)
          .not("actor_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      const following = new Set<string>((followingRes.data ?? []).map((r: any) => r.following_id));
      const followers = new Set<string>((followerRes.data ?? []).map((r: any) => r.follower_id));
      const hypers = new Set<string>((hyperRes.data ?? []).map((r: any) => r.friend_id));

      /**
       * Closeness, best first. Sharing is an act aimed at someone specific,
       * so the order of this list is the entire feature — a flat alphabet of
       * everyone you have ever brushed against is the same as no list.
       */
      const rank = (id: string): number => {
        if (hypers.has(id)) return 0;                              // a Hyper
        if (following.has(id) && followers.has(id)) return 1;      // mutual
        if (following.has(id)) return 2;                           // you follow
        if (followers.has(id)) return 3;                           // follows you
        return 4;                                                  // acquaintance
      };

      const connections = new Set<string>([...following, ...followers, ...hypers]);
      connections.delete(user.id);

      // Notification actors are anyone who ever hyped or commented on your
      // work — a stranger who tapped a star once ranks alongside people you
      // talk to. In an app this size that quietly meant "everybody", which is
      // what made the share list look unfiltered. They are a TOP-UP now, used
      // only when you barely have connections yet, so a new account still has
      // somewhere to send things.
      const allIds = new Set(connections);
      if (connections.size < THIN_CONNECTIONS) {
        for (const r of notifRes.data ?? []) {
          if (r.actor_id) allIds.add(r.actor_id as string);
        }
      }
      allIds.delete(user.id);

      if (allIds.size === 0) { setFriends([]); setLoading(false); return; }

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_hue, avatar_url")
        .in("id", [...allIds])
        .eq("profile_completed", true)
        .limit(80);

      const sorted = ((profiles ?? []) as Friend[])
        .map((f) => ({ ...f, tier: rank(f.id) }))
        .sort((a, b) => (a.tier ?? 4) - (b.tier ?? 4));

      setFriends(sorted);
      setLoading(false);
    }
    load();
  }, [open, supabase]);

  useEffect(() => { if (!open) { setQuery(""); setSent(new Set()); } }, [open]);

  const filtered = friends.filter((f) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      (f.display_name ?? "").toLowerCase().includes(q) ||
      (f.username ?? "").toLowerCase().includes(q)
    );
  });

  function toggleSend(id: string) {
    setSent((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const path = targetType === "shot" ? `/shots/${postId}` : `/p/${postId}`;
  const postUrl = typeof window !== "undefined"
    ? `${window.location.origin}${path}`
    : `https://app.hypefy.chat${path}`;

  async function copyLink() {
    try { await navigator.clipboard.writeText(postUrl); } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  /**
   * Share post/shot to the user's Show (24-hour story).
   * Uses the currently selected image slot as the thumbnail/embed frame.
   */
  async function shareToShow() {
    if (addingShow || showAdded) return;
    setAddingShow(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (targetType === "shot") {
        // Sharing a Shot — copy its media into the user's Show
        const { data } = await supabase.from("shots").select("media_url").eq("id", postId).maybeSingle();
        const mediaUrl = data?.media_url ?? null;
        if (!mediaUrl) return;
        await supabase.from("shows").insert({ user_id: user.id, media_url: mediaUrl });
      } else {
        // Sharing a Post — use the selected image slot as media_url thumbnail
        const mediaUrl = imageUrls?.[selectedIdx] ?? imageUrls?.[0] ?? null;

        // If we couldn't derive from passed images, fall back to fetching from DB
        const resolvedUrl = mediaUrl ?? await (async () => {
          const { data } = await supabase
            .from("posts")
            .select("image_url, image_urls")
            .eq("id", postId)
            .maybeSingle();
          return (data?.image_urls as string[] | null)?.[selectedIdx]
            ?? (data?.image_urls as string[] | null)?.[0]
            ?? data?.image_url
            ?? null;
        })();

        // shows.media_url is NOT NULL — a text-only post has nothing to show.
        if (!resolvedUrl) { showToast("That post has no image to share."); return; }

        // Try with linked_post_id; fall back gracefully if column not yet migrated
        const { error } = await supabase.from("shows").insert({
          user_id: user.id,
          media_url: resolvedUrl,
          linked_post_id: postId,
        });
        if (error) {
          // linked_post_id may predate the column; retry without it.
          const { error: fallbackErr } = await supabase
            .from("shows").insert({ user_id: user.id, media_url: resolvedUrl });
          if (fallbackErr) { showToast("Couldn't add to your Show."); return; }
        }
      }

      setShowAdded(true);
      setTimeout(() => { setShowAdded(false); onClose(); }, 1100);
    } finally {
      setAddingShow(false);
    }
  }

  const [reposting, setReposting] = useState(false);

  /** Real repost — inserts into reposts (trigger bumps count + notifies owner). */
  async function repost() {
    if (reposting || targetType !== "post") return;
    setReposting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from("reposts").insert({ user_id: user.id, post_id: postId });
      if (error?.code === "23505") {
        // Already reposted — toggle off
        await supabase.from("reposts").delete().eq("user_id", user.id).eq("post_id", postId);
        setReposted(false);
        return;
      }
      if (error) { showToast("Couldn't repost. Try again."); return; }
      setReposted(true);
      setTimeout(() => { setReposted(false); onClose(); }, 900);
    } finally {
      setReposting(false);
    }
  }

  async function sendToSelected() {
    if (sendingDm || sent.size === 0) return;
    setSendingDm(true);
    const ids = [...sent];
    // Per-recipient success/failure: sends used to fail silently, so a share
    // that reached nobody still showed the "Sent" confirmation.
    const results = await Promise.all(
      ids.map(async (uid) => {
        const { data: convId, error } = await supabase.rpc("get_or_create_dm", { p_other: uid });
        if (error || !convId) return false;
        const { error: sendErr } = targetType === "shot"
          ? await supabase.rpc("send_message", {
              p_conversation_id: convId, p_body: undefined, p_kind: "shot",
              p_post_id: undefined, p_shot_id: postId, p_reply_to_id: undefined,
            })
          : await supabase.rpc("send_message", {
              p_conversation_id: convId, p_body: undefined, p_kind: "post",
              p_post_id: postId, p_reply_to_id: undefined,
            });
        return !sendErr;
      }),
    );
    setSendingDm(false);

    const failed = results.filter((ok) => !ok).length;
    if (failed === ids.length) {
      showToast("Couldn't send. Try again.");
      return;
    }
    if (failed > 0) showToast(`Sent to ${ids.length - failed} of ${ids.length}.`);

    setDmDone(true);
    setTimeout(() => { setDmDone(false); setSent(new Set()); onClose(); }, 900);
  }

  // Image picker helpers
  const imgs = imageUrls ?? [];
  const hasMultiple = imgs.length > 1;
  const safeIdx = Math.min(selectedIdx, imgs.length - 1);
  const currentUrl = imgs[safeIdx] ?? null;

  function prevImg() { setSelectedIdx((i) => Math.max(i - 1, 0)); }
  function nextImg() { setSelectedIdx((i) => Math.min(i + 1, imgs.length - 1)); }

  return (
    <BottomSheet open={open} onClose={onClose} title="Send to">

      {/* Square image picker -- only for posts with images */}
      {targetType === "post" && currentUrl && (
        <div className="mb-4">
          {/* Square image with prev/next taps + index badge */}
          <div
            className="relative mx-auto aspect-square w-full max-w-[220px] overflow-hidden rounded-2xl bg-surface"
            onTouchStart={(e) => { imgSwipeStartX.current = e.touches[0].clientX; }}
            onTouchEnd={(e) => {
              const dx = imgSwipeStartX.current - e.changedTouches[0].clientX;
              if (Math.abs(dx) >= 28) dx > 0 ? nextImg() : prevImg();
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentUrl}
              alt="Selected frame"
              className="h-full w-full object-cover transition-opacity duration-150"
            />

            {/* Index badge */}
            {hasMultiple && (
              <span className="absolute right-2 top-2 rounded-lg bg-black/60 px-2 py-0.5 text-xs font-bold text-white backdrop-blur-sm">
                {safeIdx + 1}/{imgs.length}
              </span>
            )}

            {/* Prev / Next tap zones */}
            {hasMultiple && (
              <>
                {safeIdx > 0 && (
                  <button
                    type="button"
                    onClick={prevImg}
                    aria-label="Previous image"
                    className="absolute inset-y-0 left-0 flex w-10 items-center justify-center bg-gradient-to-r from-black/30 to-transparent"
                  >
                    <ChevronLeft size={18} className="text-white drop-shadow" />
                  </button>
                )}
                {safeIdx < imgs.length - 1 && (
                  <button
                    type="button"
                    onClick={nextImg}
                    aria-label="Next image"
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center bg-gradient-to-l from-black/30 to-transparent"
                  >
                    <ChevronRight size={18} className="text-white drop-shadow" />
                  </button>
                )}
              </>
            )}
          </div>

          {/* Dot indicators */}
          {hasMultiple && (
            <div className="mt-2 flex justify-center gap-1.5">
              {imgs.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedIdx(i)}
                  aria-label={`Select image ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all duration-200 ${
                    i === safeIdx ? "w-4 bg-accent" : "w-1.5 bg-foreground/20"
                  }`}
                />
              ))}
            </div>
          )}

          {/* "Choose which frame to share to Show" hint */}
          {hasMultiple && (
            <p className="mt-1.5 text-center text-[11px] text-faint">
              Tap arrows to pick which image goes to your Show
            </p>
          )}
        </div>
      )}

      {/* Search */}
      <div className="mb-3 flex h-10 items-center gap-2 rounded-pill border border-border bg-surface px-3 focus-within:border-white/25">
        <Search size={15} className="shrink-0 text-faint" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people..."
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
        />
      </div>

      {/* Friends list */}
      <div className="flex flex-col overflow-y-auto" style={{ maxHeight: "36dvh" }}>
        {loading ? (
          /* Shimmer skeleton rows shaped like friend rows */
          <div className="flex flex-col">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-1 py-2.5">
                <div className="skeleton h-[46px] w-[46px] shrink-0 rounded-[30%]" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="skeleton h-3 rounded" style={{ width: `${45 + (i % 3) * 14}%` }} />
                  <div className="skeleton h-2.5 w-16 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-faint">
            {friends.length === 0
              ? "Follow people or interact with posts to build your circle."
              : "Nobody by that name."}
          </p>
        ) : (
          filtered.map((f, i) => {
            const name = f.display_name ?? f.username ?? "User";
            const selected = sent.has(f.id);
            // Where the people you actually know end and the people who once
            // hyped a post begin. Without this the two are indistinguishable,
            // which is what made the list read as "everyone".
            const startsAcquaintances =
              (f.tier ?? 4) >= 4 && (filtered[i - 1]?.tier ?? 4) < 4;
            return (
              <div key={f.id}>
                {startsAcquaintances && (
                  <p className="px-1 pt-3 pb-1 text-[11px] font-bold tracking-widest text-faint uppercase">
                    You&rsquo;ve interacted with
                  </p>
                )}
              <button
                type="button"
                onClick={() => toggleSend(f.id)}
                className={`flex items-center gap-3 rounded-xl px-1 py-2.5 transition-colors ${
                  selected ? "bg-accent/10" : "hover:bg-white/[0.04]"
                }`}
              >
                <Avatar name={name} hue={f.avatar_hue ?? 280} size={46} src={f.avatar_url ?? undefined} />
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-semibold">{name}</p>
                  {f.username && (
                    <p className="truncate text-xs text-muted">@{f.username}</p>
                  )}
                </div>
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold transition-colors ${
                    selected
                      ? "border-accent bg-accent text-accent-ink"
                      : "border-border text-transparent"
                  }`}
                >
                  ✓
                </span>
              </button>
              </div>
            );
          })
        )}
      </div>

      {sent.size > 0 && (
        <button
          type="button"
          onClick={sendToSelected}
          disabled={sendingDm}
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-bold text-accent-ink transition-transform active:scale-[0.99] disabled:opacity-60"
        >
          {sendingDm ? (
            <><Loader2 size={16} className="animate-spin" /> Sending...</>
          ) : dmDone ? (
            <><Check size={16} /> Sent</>
          ) : (
            <>Send to {sent.size} {sent.size === 1 ? "person" : "people"}</>
          )}
        </button>
      )}

      <div className="my-3 h-px bg-border" />

      {/* Action row */}
      <div className="grid grid-cols-3 gap-2 pb-1">
        <button
          type="button"
          onClick={copyLink}
          className="flex flex-col items-center gap-2 rounded-2xl px-2 py-3 transition-colors hover:bg-white/5"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface">
            {copied ? <Check size={20} className="text-accent" /> : <Link2 size={20} />}
          </span>
          <span className={`text-xs font-medium ${copied ? "text-accent" : "text-foreground"}`}>
            {copied ? "Copied!" : "Copy link"}
          </span>
        </button>

        <button
          type="button"
          onClick={repost}
          className="flex flex-col items-center gap-2 rounded-2xl px-2 py-3 transition-colors hover:bg-white/5"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface">
            {reposted ? <Check size={20} className="text-accent" /> : <Repeat2 size={20} />}
          </span>
          <span className={`text-xs font-medium ${reposted ? "text-accent" : "text-foreground"}`}>
            {reposted ? "Reposted!" : "Repost"}
          </span>
        </button>

        {/* Share to Show — adds to the user's 24-hour story */}
        {targetType === "post" && (
          <button
            type="button"
            onClick={shareToShow}
            disabled={addingShow}
            className="flex flex-col items-center gap-2 rounded-2xl px-2 py-3 transition-colors hover:bg-white/5 disabled:opacity-60"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface">
              {addingShow ? (
                <Loader2 size={20} className="animate-spin text-muted" />
              ) : showAdded ? (
                <Check size={20} className="text-accent" />
              ) : (
                <Tv size={20} className="text-hype" />
              )}
            </span>
            <span className={`text-xs font-medium ${showAdded ? "text-accent" : "text-foreground"}`}>
              {showAdded ? "Added to Show!" : "Share to Show"}
            </span>
          </button>
        )}
      </div>
    </BottomSheet>
  );
}
