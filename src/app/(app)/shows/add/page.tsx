"use client";

import { useRef, useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  X, Images, Type, Send, Loader2, User,
  LayoutGrid, ChevronLeft, ChevronRight, ExternalLink,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { LiveCamera } from "@/components/shows/LiveCamera";
import { Avatar } from "@/components/ui/Avatar";

type State = "camera" | "pick-post" | "pick-image" | "preview";

/** One tile in the picker — a single image from a post */
type FlatImage = {
  postId: string;
  imageUrl: string | null;          // null = text-only post
  imageIndex: number;               // 0-based within that post
  totalImages: number;
  caption: string | null;
  profiles: {
    display_name: string | null;
    username: string | null;
    avatar_hue: number | null;
    avatar_url: string | null;
  } | null;
};

type PostOption = {
  id: string;
  caption: string | null;
  image_url: string | null;
  image_urls: string[] | null;
  profiles: FlatImage["profiles"];
};

export default function AddShowPage() {
  const router = useRouter();
  const supabase = createClient();
  const galleryRef = useRef<HTMLInputElement>(null);

  const [state, setState] = useState<State>("camera");
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [showCaption, setShowCaption] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Post-share state
  const [posts, setPosts] = useState<PostOption[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [selectedPost, setSelectedPost] = useState<PostOption | null>(null);
  const [selectedFlat, setSelectedFlat] = useState<FlatImage | null>(null);

  // ── Fetch user's posts when entering pick-post mode ──
  useEffect(() => {
    if (state !== "pick-post") return;
    setLoadingPosts(true);
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoadingPosts(false); return; }
      supabase
        .from("posts")
        .select("id, caption, image_url, image_urls, profiles(display_name, username, avatar_hue, avatar_url)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30)
        .then(({ data }) => {
          setPosts((data ?? []).map((p: any) => ({
            ...p,
            profiles: Array.isArray(p.profiles) ? p.profiles[0] ?? null : p.profiles,
          })));
          setLoadingPosts(false);
        });
    });
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Flatten a post into individual image tiles */
  function flattenPost(post: PostOption): FlatImage[] {
    const urls = post.image_urls?.length
      ? post.image_urls
      : post.image_url
        ? [post.image_url]
        : [];

    if (urls.length === 0) {
      // Text-only post — one tile, no image
      return [{ postId: post.id, imageUrl: null, imageIndex: 0, totalImages: 0, caption: post.caption, profiles: post.profiles }];
    }

    return urls.map((url, i) => ({
      postId: post.id,
      imageUrl: url,
      imageIndex: i,
      totalImages: urls.length,
      caption: post.caption,
      profiles: post.profiles,
    }));
  }

  function onCapture(file: File) {
    setSelectedFlat(null); setSelectedPost(null);
    setCapturedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setState("preview");
  }

  function onGalleryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFlat(null); setSelectedPost(null);
    setCapturedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setState("preview");
  }

  /** User tapped a post in the grid */
  function onPostTap(post: PostOption) {
    const tiles = flattenPost(post);
    if (tiles.length === 1) {
      // Single image or text-only — go straight to preview
      commitFlat(post, tiles[0]);
    } else {
      // Multiple images — let user pick which one
      setSelectedPost(post);
      setState("pick-image");
    }
  }

  /** User chose a specific image tile */
  function commitFlat(post: PostOption, flat: FlatImage) {
    setSelectedPost(post);
    setSelectedFlat(flat);
    setPreviewUrl(flat.imageUrl);   // used only to display in preview
    setCapturedFile(null);
    setState("preview");
  }

  function discard() {
    if (previewUrl && capturedFile) URL.revokeObjectURL(previewUrl);
    setCapturedFile(null); setPreviewUrl(null);
    setCaption(""); setShowCaption(false);
    setError(null); setSelectedFlat(null); setSelectedPost(null);
    setState("camera");
  }

  function share() {
    setError(null);
    startTransition(async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError("Not signed in."); return; }

      let mediaUrl: string | null = null;
      let linkedPostId: string | null = null;

      if (capturedFile) {
        // Own camera / gallery show
        const ext = capturedFile.name.split(".").pop() ?? "jpg";
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("show-media")
          .upload(path, capturedFile, { contentType: capturedFile.type, upsert: false });
        if (uploadErr) { setError("Upload failed: " + uploadErr.message); return; }
        mediaUrl = supabase.storage.from("show-media").getPublicUrl(path).data.publicUrl;
      } else if (selectedFlat) {
        // Post share — use the specific selected image as media_url
        mediaUrl = selectedFlat.imageUrl;
        linkedPostId = selectedFlat.postId;
      }

      // Try insert with linked_post_id; fall back without if column missing
      let insertErr: any = null;
      if (linkedPostId) {
        const r1 = await supabase.from("shows").insert({
          user_id: user.id,
          media_url: mediaUrl,
          caption: caption.trim() || null,
          linked_post_id: linkedPostId,
        });
        insertErr = r1.error;
        if (insertErr) {
          // Column doesn't exist yet — retry without
          const r2 = await supabase.from("shows").insert({
            user_id: user.id,
            media_url: mediaUrl,
            caption: caption.trim() || null,
          });
          insertErr = r2.error;
        }
      } else {
        const r = await supabase.from("shows").insert({
          user_id: user.id,
          media_url: mediaUrl,
          caption: caption.trim() || null,
        });
        insertErr = r.error;
      }

      if (insertErr) { setError(insertErr.message); return; }
      router.push("/home");
      router.refresh();
    });
  }

  // ─────────────────────────────────────────────────────────
  //  Pick-post grid
  // ─────────────────────────────────────────────────────────
  if (state === "pick-post") {
    // All posts flattened into individual image tiles
    const allTiles = posts.flatMap(flattenPost);

    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black">
        <div className="flex items-center gap-3 px-4 pb-3 pt-14">
          <button type="button" onClick={() => setState("camera")}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white">
            <ChevronLeft size={20} />
          </button>
          <span className="flex-1 text-center text-base font-bold text-white">Share a Post</span>
          <span className="w-9" />
        </div>

        {loadingPosts ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 size={28} className="animate-spin text-white/50" />
          </div>
        ) : allTiles.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <LayoutGrid size={40} className="text-white/25" />
            <p className="text-sm text-white/50">No posts yet</p>
            <p className="text-xs text-white/35">Create a post first, then share it to your Show.</p>
          </div>
        ) : (
          <div className="no-scrollbar grid flex-1 grid-cols-3 gap-0.5 overflow-y-auto">
            {allTiles.map((tile, i) => (
              <button
                key={`${tile.postId}-${tile.imageIndex}`}
                type="button"
                onClick={() => {
                  const post = posts.find((p) => p.id === tile.postId)!;
                  commitFlat(post, tile);
                }}
                className="relative aspect-square w-full overflow-hidden bg-white/5 active:opacity-70"
              >
                {tile.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={tile.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2">
                    <Type size={18} className="text-white/30" />
                    {tile.caption && (
                      <p className="line-clamp-3 text-center text-[10px] leading-tight text-white/50">
                        {tile.caption}
                      </p>
                    )}
                  </div>
                )}
                {/* Image position badge for multi-image posts */}
                {tile.totalImages > 1 && (
                  <span className="absolute right-1.5 top-1.5 rounded-full bg-black/65 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm">
                    {tile.imageIndex + 1}/{tile.totalImages}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────
  //  Pick-image (multi-image post)
  // ─────────────────────────────────────────────────────────
  if (state === "pick-image" && selectedPost) {
    const tiles = flattenPost(selectedPost);
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black">
        <div className="flex items-center gap-3 px-4 pb-3 pt-14">
          <button type="button" onClick={() => setState("pick-post")}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white">
            <ChevronLeft size={20} />
          </button>
          <span className="flex-1 text-center text-base font-bold text-white">Choose Image</span>
          <span className="w-9" />
        </div>
        <p className="mb-2 text-center text-xs text-white/40">Select which image to share</p>
        <div className="no-scrollbar grid flex-1 grid-cols-3 gap-0.5 overflow-y-auto">
          {tiles.map((tile) => (
            <button
              key={tile.imageIndex}
              type="button"
              onClick={() => commitFlat(selectedPost, tile)}
              className="relative aspect-square w-full overflow-hidden bg-white/5 active:opacity-70"
            >
              {tile.imageUrl
                ? <img src={tile.imageUrl} alt="" className="h-full w-full object-cover" /> // eslint-disable-line @next/next/no-img-element
                : <div className="flex h-full w-full items-center justify-center"><Type size={20} className="text-white/30" /></div>}
              <span className="absolute bottom-1.5 right-1.5 rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
                {tile.imageIndex + 1}/{tile.totalImages}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────
  //  Main camera + preview
  // ─────────────────────────────────────────────────────────
  const authorName  = selectedFlat?.profiles?.display_name ?? selectedFlat?.profiles?.username ?? "User";
  const authorHue   = selectedFlat?.profiles?.avatar_hue ?? 280;
  const authorAvatarUrl = selectedFlat?.profiles?.avatar_url ?? undefined;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">

      {/* ── CAMERA ── */}
      {state === "camera" && (
        <>
          <div className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between px-4 pb-2 pt-14">
            <button type="button" aria-label="Close" onClick={() => router.back()}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm">
              <X size={20} />
            </button>
            <span className="text-base font-extrabold tracking-tight text-white">Your Show</span>
            <span className="rounded-pill border border-white/30 px-2.5 py-0.5 text-xs text-white/60">24h</span>
          </div>

          <div className="flex-1 overflow-hidden">
            <LiveCamera onCapture={onCapture} />
          </div>

          <div className="absolute bottom-10 left-8 z-10 flex flex-col items-center gap-3">
            <button type="button" aria-label="Pick from gallery" onClick={() => galleryRef.current?.click()}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm">
              <Images size={22} />
            </button>
            <button type="button" aria-label="Share a post" onClick={() => setState("pick-post")}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm">
              <LayoutGrid size={20} />
            </button>
            <input ref={galleryRef} type="file" accept="image/*,video/*" className="hidden" onChange={onGalleryChange} />
          </div>
          <div className="absolute bottom-10 left-24 z-10 flex flex-col gap-3">
            <span className="flex h-12 items-center text-xs font-medium text-white/60">Gallery</span>
            <span className="flex h-12 items-center text-xs font-medium text-white/60">Share Post</span>
          </div>
        </>
      )}

      {/* ── PREVIEW ── */}
      {(state === "preview" || pending) && (
        <>
          {/* Background — dark gradient for post-share, image for camera/gallery */}
          <div className="absolute inset-0">
            {selectedFlat ? (
              // Post-share: blurred image background or dark gradient
              selectedFlat.imageUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={selectedFlat.imageUrl} alt="" aria-hidden className="h-full w-full scale-110 object-cover blur-3xl" style={{ opacity: 0.35 }} />
                  <div className="absolute inset-0 bg-black/60" />
                </>
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-[#0d0d1e] via-[#111128] to-[#08080f]" />
              )
            ) : previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Show preview" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-accent/30 to-[hsl(280deg_80%_20%)]" />
            )}
          </div>
          <div className="absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-black/60 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-60 bg-gradient-to-t from-black/80 to-transparent" />

          {/* Top controls */}
          <div className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between px-4 pt-14">
            <button type="button" aria-label="Discard" onClick={discard}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm">
              <X size={20} />
            </button>
            <button type="button" aria-label="Toggle caption" onClick={() => setShowCaption((v) => !v)}
              className={`flex h-9 w-9 items-center justify-center rounded-full backdrop-blur-sm transition-colors ${showCaption ? "bg-accent text-accent-ink" : "bg-black/40 text-white"}`}>
              <Type size={18} />
            </button>
          </div>

          {/* ── Hypefy embed card preview — matches the viewer exactly ── */}
          {selectedFlat && (
            <div
              className="absolute inset-x-6 z-20 overflow-hidden rounded-2xl border border-white/[0.12] bg-black/50 shadow-2xl backdrop-blur-2xl"
              style={{ top: "17%", maxHeight: "60%" }}
            >
              {/* Author row */}
              <div className="flex items-center gap-2.5 px-3.5 py-3">
                <Avatar name={authorName} hue={authorHue} size={26} src={authorAvatarUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold leading-tight text-white">{authorName}</p>
                  {selectedFlat.profiles?.username && (
                    <p className="truncate text-[10px] text-white/45">@{selectedFlat.profiles.username}</p>
                  )}
                </div>
                <span className="shrink-0 rounded-full border border-white/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white/50">
                  Hypefy
                </span>
              </div>
              <div className="h-px bg-white/[0.08]" />

              {/* Image or text-only fallback */}
              {selectedFlat.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selectedFlat.imageUrl} alt="" className="w-full object-cover" style={{ maxHeight: "52vw" }} />
              ) : (
                <div className="flex min-h-[80px] items-center justify-center bg-white/[0.04] px-4 py-5">
                  {selectedFlat.caption ? (
                    <p className="line-clamp-4 text-center text-sm leading-snug text-white/75">
                      {selectedFlat.caption}
                    </p>
                  ) : (
                    <Type size={28} className="text-white/20" />
                  )}
                </div>
              )}

              {/* Caption snippet (only when image shown) */}
              {selectedFlat.imageUrl && selectedFlat.caption && (
                <>
                  <div className="h-px bg-white/[0.08]" />
                  <p className="line-clamp-2 px-3.5 py-2.5 text-[12px] leading-snug text-white/70">
                    {selectedFlat.caption}
                  </p>
                </>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between border-t border-white/[0.08] px-3.5 py-2.5">
                <span className="text-[11px] font-semibold text-white/40">Tap to view post</span>
                <ExternalLink size={13} className="text-white/40" />
              </div>
            </div>
          )}

          {/* Caption input */}
          <div className="absolute inset-x-4 z-20" style={{ bottom: 96 }}>
            {showCaption ? (
              <input autoFocus value={caption}
                onChange={(e) => setCaption(e.target.value.slice(0, 150))}
                onBlur={() => { if (!caption.trim()) setShowCaption(false); }}
                placeholder="Add a caption…"
                className="w-full rounded-2xl bg-black/35 px-4 py-3 text-base text-white outline-none backdrop-blur-sm placeholder:text-white/55"
              />
            ) : (
              <button type="button" onClick={() => setShowCaption(true)}
                className="flex items-center gap-2 text-base font-medium text-white/70 drop-shadow">
                <Type size={18} /> {caption || "Add a caption…"}
              </button>
            )}
          </div>

          {error && (
            <div className="absolute inset-x-4 z-20" style={{ bottom: 150 }}>
              <p className="rounded-xl bg-danger/80 px-3 py-2 text-center text-xs text-white backdrop-blur-sm">{error}</p>
            </div>
          )}

          {/* Bottom action bar */}
          <div className="absolute inset-x-0 bottom-0 z-20 flex items-center gap-2.5 px-4 pb-9 pt-4">
            <span className="flex items-center gap-2 rounded-pill bg-white/15 py-1.5 pl-1.5 pr-3.5 backdrop-blur-sm">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/25 text-white"><User size={15} /></span>
              <span className="text-sm font-semibold text-white">Your Show</span>
            </span>
            <span className="rounded-pill bg-white/15 px-3.5 py-2 text-sm font-semibold text-white/75 backdrop-blur-sm">24h</span>
            <div className="flex-1" />
            <button type="button" onClick={share} disabled={pending} aria-label="Share to your Show"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-ink shadow-lg transition-transform active:scale-95 disabled:opacity-60">
              {pending ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
