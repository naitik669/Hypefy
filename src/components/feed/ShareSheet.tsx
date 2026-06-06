"use client";

import { useEffect, useRef, useState } from "react";
import { Link2, PlusCircle, Repeat2, Check, Search, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Avatar } from "@/components/ui/Avatar";

type Friend = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_hue: number | null;
};

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
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [reposted, setReposted] = useState(false);
  const [addingShot, setAddingShot] = useState(false);
  const [shotAdded, setShotAdded] = useState(false);
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

      const [followingRes, followerRes, notifRes] = await Promise.all([
        supabase.from("follows").select("following_id").eq("follower_id", user.id).limit(100),
        supabase.from("follows").select("follower_id").eq("following_id", user.id).limit(100),
        supabase.from("notifications")
          .select("actor_id")
          .eq("user_id", user.id)
          .not("actor_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      const allIds = new Set<string>();
      followingRes.data?.forEach((r: any) => allIds.add(r.following_id));
      followerRes.data?.forEach((r: any) => allIds.add(r.follower_id));
      notifRes.data?.forEach((r: any) => r.actor_id && allIds.add(r.actor_id));
      allIds.delete(user.id);

      if (allIds.size === 0) { setFriends([]); setLoading(false); return; }

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_hue, avatar_url")
        .in("id", [...allIds])
        .eq("profile_completed", true)
        .limit(80);

      setFriends((profiles ?? []) as Friend[]);
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
    : `https://hypefy.chat${path}`;

  async function copyLink() {
    try { await navigator.clipboard.writeText(postUrl); } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  /**
   * Share post/shot to the user's Shot (story-style 24h content).
   * Uses the currently selected image slot as the thumbnail/embed frame.
   */
  async function shareToShot() {
    if (addingShot || shotAdded) return;
    setAddingShot(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (targetType === "shot") {
        // Sharing a Shot -- copy its media as a clip
        const { data } = await supabase.from("shots").select("media_url").eq("id", postId).maybeSingle();
        const mediaUrl = data?.media_url ?? null;
        if (!mediaUrl) return;
        await supabase.from("shows").insert({ user_id: user.id, media_url: mediaUrl });
      } else {
        // Sharing a Post -- use the selected image slot as media_url thumbnail
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

        // Try with linked_post_id; fall back gracefully if column not yet migrated
        const { error } = await supabase.from("shows").insert({
          user_id: user.id,
          media_url: resolvedUrl,
          linked_post_id: postId,
        });
        if (error) {
          await supabase.from("shows").insert({ user_id: user.id, media_url: resolvedUrl });
        }
      }

      setShotAdded(true);
      setTimeout(() => { setShotAdded(false); onClose(); }, 1100);
    } finally {
      setAddingShot(false);
    }
  }

  function repost() {
    setReposted(true);
    setTimeout(() => { setReposted(false); onClose(); }, 900);
  }

  async function sendToSelected() {
    if (sendingDm || sent.size === 0) return;
    setSendingDm(true);
    const ids = [...sent];
    await Promise.all(
      ids.map(async (uid) => {
        const { data: convId, error } = await supabase.rpc("get_or_create_dm", { p_other: uid });
        if (error || !convId) return;
        if (targetType === "shot") {
          await supabase.rpc("send_message", {
            p_conversation_id: convId, p_body: null, p_kind: "shot",
            p_post_id: null, p_shot_id: postId, p_reply_to_id: null,
          });
        } else {
          await supabase.rpc("send_message", {
            p_conversation_id: convId, p_body: null, p_kind: "post",
            p_post_id: postId, p_reply_to_id: null,
          });
        }
      }),
    );
    setSendingDm(false);
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

          {/* "Choose which frame to share to Shot" hint */}
          {hasMultiple && (
            <p className="mt-1.5 text-center text-[11px] text-faint">
              Tap arrows to pick which image goes to your Shot
            </p>
          )}
        </div>
      )}

      {/* Search */}
      <div className="mb-3 flex h-10 items-center gap-2 rounded-pill border border-border bg-surface px-3 focus-within:border-accent/40">
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
          <div className="flex items-center justify-center py-6">
            <Loader2 size={20} className="animate-spin text-muted" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-faint">
            {friends.length === 0
              ? "Follow people or interact with posts to see connections here."
              : "No results"}
          </p>
        ) : (
          filtered.map((f) => {
            const name = f.display_name ?? f.username ?? "User";
            const selected = sent.has(f.id);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => toggleSend(f.id)}
                className={`flex items-center gap-3 rounded-xl px-1 py-2.5 transition-colors ${
                  selected ? "bg-accent/10" : "hover:bg-white/[0.04]"
                }`}
              >
                <Avatar name={name} hue={f.avatar_hue ?? 280} size={46} />
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

        {/* Share to Shot -- available for all post types */}
        {targetType === "post" && (
          <button
            type="button"
            onClick={shareToShot}
            disabled={addingShot}
            className="flex flex-col items-center gap-2 rounded-2xl px-2 py-3 transition-colors hover:bg-white/5 disabled:opacity-60"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface">
              {addingShot ? (
                <Loader2 size={20} className="animate-spin text-muted" />
              ) : shotAdded ? (
                <Check size={20} className="text-accent" />
              ) : (
                <PlusCircle size={20} className="text-hype" />
              )}
            </span>
            <span className={`text-xs font-medium ${shotAdded ? "text-accent" : "text-foreground"}`}>
              {shotAdded ? "Added to Shot!" : "Share to Shot"}
            </span>
          </button>
        )}
      </div>
    </BottomSheet>
  );
}
