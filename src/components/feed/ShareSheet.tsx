"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, CircleFadingPlus, Link2, Loader2, Repeat2, Search, Share2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { one } from "@/lib/supabase/typed";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Avatar } from "@/components/ui/Avatar";
import { SendIcon } from "@/components/ui/ShareIcon";
import { useToast } from "@/components/ui/ToastProvider";
import { CommentIcon } from "@/components/ui/CommentIcon";

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

/** What is being sent, for the preview under the title. */
type Preview = { thumb: string | null; caption: string | null; username: string | null };

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

/**
 * The height of the bottom of the sheet, in both of its states: the row of
 * options, and sending. One number, so switching between them cannot move
 * anything above.
 */
const FOOT = "h-[82px]";

/**
 * Send to.
 *
 * Laid out as faces, not rows. Picking who gets something is recognising
 * people, and a face is recognised at a glance where a row of names and
 * handles has to be read — so it is three across and large, on a sheet that
 * opens most of the way up, with what you are sending named at the top.
 *
 * The bottom of the sheet is one of two things, never both. With nobody
 * picked it is everything else you can do with the post, in a row that
 * scrolls. Pick anyone and that row gives way to sending: who it is going to,
 * a line to add, and one button that says how many people it reaches. Two
 * sets of controls on screen at once was what made the old sheet a list of
 * people with a button and a toolbar bolted underneath it.
 */
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
  const supabase = useMemo(() => createClient(), []);
  const showToast = useToast();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [copied, setCopied] = useState(false);
  const [reposted, setReposted] = useState(false);
  const [reposting, setReposting] = useState(false);
  const [addingShow, setAddingShow] = useState(false);
  const [showAdded, setShowAdded] = useState(false);
  const [sendingDm, setSendingDm] = useState(false);
  const [dmDone, setDmDone] = useState(false);
  /**
   * Choosing which photo goes to your Show.
   *
   * A step of its own now, reached only from Add to Show on a post with more
   * than one photo. It used to be the first thing on the sheet for every
   * multi-photo post — a large picture you had to scroll past to reach the
   * people you had opened the sheet to send it to.
   */
  const [picking, setPicking] = useState(false);

  const [selectedIdx, setSelectedIdx] = useState(initialImageIdx);
  const imgSwipeStartX = useRef(0);

  useEffect(() => {
    if (open) setSelectedIdx(initialImageIdx);
  }, [open, initialImageIdx]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSent(new Set());
      setNote("");
      setPicking(false);
    }
  }, [open]);

  /* --- Who to send to ---------------------------------------------------- */
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

      const following = new Set<string>((followingRes.data ?? []).map((r) => r.following_id as string));
      const followers = new Set<string>((followerRes.data ?? []).map((r) => r.follower_id as string));
      const hypers = new Set<string>((hyperRes.data ?? []).map((r) => r.friend_id as string));

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
      // work. They are a TOP-UP, used only when you barely have connections
      // yet, so a new account still has somewhere to send things.
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

  /* --- What is being sent ------------------------------------------------ */
  useEffect(() => {
    if (!open) return;
    let live = true;
    (async () => {
      if (targetType === "shot") {
        const { data } = await supabase
          .from("shots")
          .select("caption, poster_url, profiles!shots_user_id_fkey(username)")
          .eq("id", postId)
          .maybeSingle();
        if (!live || !data) return;
        const author = one(data.profiles as { username: string | null } | { username: string | null }[] | null);
        setPreview({ thumb: data.poster_url ?? null, caption: data.caption ?? null, username: author?.username ?? null });
        return;
      }
      const { data } = await supabase
        .from("posts")
        .select("caption, body, image_url, image_urls, profiles!posts_user_id_fkey(username)")
        .eq("id", postId)
        .maybeSingle();
      if (!live || !data) return;
      const author = one(data.profiles as { username: string | null } | { username: string | null }[] | null);
      const urls = (data.image_urls as string[] | null) ?? [];
      setPreview({
        thumb: imageUrls?.[initialImageIdx] ?? urls[0] ?? data.image_url ?? null,
        caption: data.caption ?? data.body ?? null,
        username: author?.username ?? null,
      });
    })();
    return () => {
      live = false;
    };
  }, [open, postId, targetType, supabase, imageUrls, initialImageIdx]);

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
      if (next.has(id)) next.delete(id);
      else next.add(id);
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

  /** The phone's own share sheet, where there is one; the link otherwise. */
  async function shareElsewhere() {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ url: postUrl });
      } catch {
        /* dismissed */
      }
      return;
    }
    await copyLink();
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
        const { data } = await supabase.from("shots").select("media_url").eq("id", postId).maybeSingle();
        const mediaUrl = data?.media_url ?? null;
        if (!mediaUrl) return;
        await supabase.from("shows").insert({ user_id: user.id, media_url: mediaUrl });
      } else {
        const mediaUrl = imageUrls?.[selectedIdx] ?? imageUrls?.[0] ?? null;

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

  /** Straight to the Show — unless there is a photo to choose first. */
  function addToShow() {
    if (targetType === "post" && (imageUrls?.length ?? 0) > 1) {
      setPicking(true);
      return;
    }
    void shareToShow();
  }

  /** Real repost — inserts into reposts (trigger bumps count + notifies owner). */
  async function repost() {
    if (reposting || targetType !== "post") return;
    setReposting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from("reposts").insert({ user_id: user.id, post_id: postId });
      if (error?.code === "23505") {
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
    const message = note.trim();
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
        if (sendErr) return false;
        // What you wrote goes after the post, as its own message — the way it
        // reads in the chat: the thing, then what you said about it.
        if (message) {
          await supabase.rpc("send_message", {
            p_conversation_id: convId, p_body: message, p_kind: "text",
            p_post_id: undefined, p_reply_to_id: undefined,
          });
        }
        return true;
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
    setTimeout(() => { setDmDone(false); setSent(new Set()); setNote(""); onClose(); }, 900);
  }

  /* --- The photo step ----------------------------------------------------- */
  const imgs = imageUrls ?? [];
  const safeIdx = Math.max(0, Math.min(selectedIdx, imgs.length - 1));
  const currentUrl = imgs[safeIdx] ?? null;
  function prevImg() { setSelectedIdx((i) => Math.max(i - 1, 0)); }
  function nextImg() { setSelectedIdx((i) => Math.min(i + 1, imgs.length - 1)); }

  const picked = friends.filter((f) => sent.has(f.id));
  const pickedNames = picked.map((f) => f.display_name ?? f.username ?? "User");

  /* --- Footer: everything else, or sending ------------------------------- */
  const footer = picking ? (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => setPicking(false)}
        className="flex h-11 items-center gap-1.5 rounded-2xl bg-surface px-4 text-sm font-semibold text-muted"
      >
        <ArrowLeft size={16} /> Back
      </button>
      <button
        type="button"
        onClick={() => void shareToShow()}
        disabled={addingShow}
        className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-accent text-sm font-extrabold text-accent-ink transition-transform active:scale-[0.99] disabled:opacity-60"
      >
        {addingShow ? <Loader2 size={16} className="animate-spin" /> : showAdded ? <Check size={16} /> : null}
        {showAdded ? "Added to your Show" : "Add this one to your Show"}
      </button>
    </div>
  ) : sent.size > 0 ? (
    // The same height as the row of options it replaces, so picking someone
    // changes what is at the bottom and not where the bottom is. The first
    // version stacked names, a message box and a full-width button — twice
    // the height of the options — and the whole grid jumped when it arrived.
    <div key="send" className={`${FOOT} animate-fade-swap flex flex-col justify-center gap-2`}>
      <div className="flex h-6 items-center gap-2">
        <div className="flex">
          {picked.slice(0, 3).map((f, i) => (
            <span
              key={f.id}
              className="rounded-[9px] ring-2 ring-elevated"
              style={{ marginLeft: i === 0 ? 0 : -6 }}
            >
              <Avatar
                name={f.display_name ?? f.username ?? "User"}
                hue={f.avatar_hue ?? 280}
                size={24}
                src={f.avatar_url ?? undefined}
                className="rounded-[8px]"
              />
            </span>
          ))}
        </div>
        <p className="min-w-0 flex-1 truncate text-[13px] text-muted">
          <span className="font-semibold text-foreground">
            {pickedNames.slice(0, 2).join(", ")}
          </span>
          {pickedNames.length > 2 && ` and ${pickedNames.length - 2} more`}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a message…"
          maxLength={500}
          className="h-11 min-w-0 flex-1 rounded-2xl bg-surface px-3.5 text-sm outline-none placeholder:text-faint"
        />
        <button
          type="button"
          onClick={() => void sendToSelected()}
          disabled={sendingDm}
          aria-label={`Send to ${sent.size}`}
          className="flex h-11 shrink-0 items-center gap-2 rounded-2xl bg-accent pl-4 pr-2 text-sm font-extrabold text-accent-ink transition-transform active:scale-[0.97] disabled:opacity-60"
        >
          {sendingDm ? (
            <Loader2 size={16} className="animate-spin" />
          ) : dmDone ? (
            <Check size={16} />
          ) : (
            <SendIcon size={15} weight="fill" />
          )}
          {dmDone ? "Sent" : "Send"}
          <span className="flex h-7 min-w-7 items-center justify-center rounded-[10px] bg-black/15 px-1.5 text-[13px] tabular-nums">
            {sent.size}
          </span>
        </button>
      </div>
    </div>
  ) : (
    <div key="actions" className={`${FOOT} animate-fade-swap no-scrollbar -mx-5 flex items-start gap-3 overflow-x-auto px-5`}>
      <Action label={copied ? "Copied" : "Copy link"} done={copied} onClick={() => void copyLink()}>
        {copied ? <Check size={19} /> : <Link2 size={19} />}
      </Action>
      {targetType === "post" && (
        <Action label={reposted ? "Reposted" : "Repost"} done={reposted} onClick={() => void repost()}>
          {reposted ? <Check size={19} /> : <Repeat2 size={19} />}
        </Action>
      )}
      <Action
        label={showAdded ? "Added" : "Add to Show"}
        done={showAdded}
        onClick={addToShow}
      >
        {addingShow ? (
          <Loader2 size={19} className="animate-spin" />
        ) : showAdded ? (
          <Check size={19} />
        ) : (
          <CircleFadingPlus size={19} />
        )}
      </Action>
      <Action
        label="WhatsApp"
        onClick={() =>
          window.open(`https://wa.me/?text=${encodeURIComponent(postUrl)}`, "_blank", "noopener")
        }
        tint="bg-[#1f3b27] text-[#4ade80]"
      >
        <CommentIcon size={19} />
      </Action>
      <Action label="More" onClick={() => void shareElsewhere()}>
        <Share2 size={19} />
      </Action>
    </div>
  );

  return (
    <BottomSheet open={open} onClose={onClose} title="Send to" size="tall" footer={footer}>
      {picking ? (
        <div className="pb-2">
          <p className="mb-3 text-center text-[13px] text-muted">
            Which photo goes to your Show?
          </p>
          <div
            className="relative mx-auto aspect-square w-full max-w-[220px] overflow-hidden rounded-2xl bg-surface"
            onTouchStart={(e) => { imgSwipeStartX.current = e.touches[0].clientX; }}
            onTouchEnd={(e) => {
              const dx = imgSwipeStartX.current - e.changedTouches[0].clientX;
              if (Math.abs(dx) >= 28) {
                if (dx > 0) nextImg();
                else prevImg();
              }
            }}
          >
            {currentUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentUrl} alt="Photo for your Show" className="h-full w-full object-cover" />
            )}
            <span className="absolute right-2 top-2 rounded-lg bg-black/60 px-2 py-0.5 text-xs font-bold text-white">
              {safeIdx + 1}/{imgs.length}
            </span>
            {safeIdx > 0 && (
              <button
                type="button"
                onClick={prevImg}
                aria-label="Previous photo"
                className="absolute inset-y-0 left-0 flex w-10 items-center justify-center bg-gradient-to-r from-black/30 to-transparent"
              >
                <ChevronLeft size={18} className="text-white drop-shadow" />
              </button>
            )}
            {safeIdx < imgs.length - 1 && (
              <button
                type="button"
                onClick={nextImg}
                aria-label="Next photo"
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center bg-gradient-to-l from-black/30 to-transparent"
              >
                <ChevronRight size={18} className="text-white drop-shadow" />
              </button>
            )}
          </div>
          <div className="mt-3 flex justify-center gap-1.5">
            {imgs.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setSelectedIdx(i)}
                aria-label={`Photo ${i + 1}`}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  i === safeIdx ? "w-4 bg-accent" : "w-1.5 bg-foreground/20"
                }`}
              />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* What is being sent. */}
          <div className="mb-3 flex items-center gap-3 rounded-2xl bg-white/[0.04] p-2">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[11px] bg-surface text-[13px] font-extrabold text-muted">
              {preview?.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview.thumb} alt="" className="h-full w-full object-cover" />
              ) : (
                "Aa"
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold">
                {preview?.caption?.trim() || (targetType === "shot" ? "A Shot" : "A post")}
              </p>
              <p className="truncate text-[11.5px] text-muted">
                {preview?.username ? `@${preview.username} · ` : ""}
                {targetType === "shot" ? "Shot" : "Post"}
              </p>
            </div>
          </div>

          <div className="mb-3 flex h-10 items-center gap-2 rounded-2xl bg-surface px-3">
            <Search size={15} className="shrink-0 text-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
            />
          </div>

          {loading ? (
            <div className="grid grid-cols-3 gap-x-2 gap-y-5 pb-2 pt-1">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-2">
                  <div className="skeleton h-[76px] w-[76px] rounded-[30%]" />
                  <div className="skeleton h-3 w-14 rounded" />
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
            <div className="grid grid-cols-3 gap-x-2 gap-y-5 pb-2 pt-1">
              {filtered.map((f, i) => {
                const name = f.display_name ?? f.username ?? "User";
                const selected = sent.has(f.id);
                // Where the people you actually know end and the people who
                // once hyped a post begin — without it the two are
                // indistinguishable, which is what made the list read as
                // "everyone".
                const startsAcquaintances =
                  !query && (f.tier ?? 4) >= 4 && (filtered[i - 1]?.tier ?? 4) < 4;
                return (
                  <div key={f.id} className="contents">
                    {startsAcquaintances && (
                      <p className="col-span-3 pt-1 text-[11px] font-semibold text-faint">
                        You&rsquo;ve interacted with
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleSend(f.id)}
                      aria-pressed={selected}
                      className="flex min-w-0 flex-col items-center gap-2 transition-transform active:scale-95"
                    >
                      <span
                        className={`relative rounded-[30%] transition-shadow ${
                          selected
                            ? "shadow-[0_0_0_2px_var(--color-elevated),0_0_0_4px_var(--color-accent)]"
                            : ""
                        }`}
                      >
                        <Avatar name={name} hue={f.avatar_hue ?? 280} size={76} src={f.avatar_url ?? undefined} />
                        {selected && (
                          <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-ink ring-2 ring-elevated">
                            <Check size={13} strokeWidth={3.4} />
                          </span>
                        )}
                      </span>
                      <span
                        className={`w-full truncate text-center text-[13px] ${
                          sent.size > 0 && !selected ? "text-muted" : "text-foreground"
                        }`}
                      >
                        {name}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </BottomSheet>
  );
}

/** One of the things you can do with a post that is not sending it. */
function Action({
  label,
  onClick,
  done = false,
  tint,
  children,
}: {
  label: string;
  onClick: () => void;
  done?: boolean;
  tint?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-[64px] shrink-0 flex-col items-center gap-1.5 transition-transform active:scale-95"
    >
      <span
        className={`flex h-12 w-12 items-center justify-center rounded-[15px] ${
          done ? "bg-accent/15 text-accent" : tint ?? "bg-surface text-foreground"
        }`}
      >
        {children}
      </span>
      {/* Two lines rather than an ellipsis: "Add to Sh…" is not a label. */}
      <span className="line-clamp-2 w-full text-center text-[11px] leading-tight text-muted">{label}</span>
    </button>
  );
}
