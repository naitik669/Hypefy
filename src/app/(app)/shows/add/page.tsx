"use client";

import { useRef, useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, Images, Type, Send, Loader2, User, LayoutGrid, ChevronLeft, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { LiveCamera } from "@/components/shows/LiveCamera";
import { Avatar } from "@/components/ui/Avatar";

type State = "camera" | "pick-post" | "preview" | "posting" | "done";

type PostOption = {
  id: string;
  caption: string | null;
  image_url: string | null;
  image_urls: string[] | null;
  profiles: {
    display_name: string | null;
    username: string | null;
    avatar_hue: number | null;
    avatar_url: string | null;
  } | null;
};

type LinkedPost = PostOption;

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

  // Post-picker state
  const [posts, setPosts] = useState<PostOption[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [linkedPost, setLinkedPost] = useState<LinkedPost | null>(null);

  // ── Fetch the user's own posts when entering pick-post mode ──
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
          const normalised = (data ?? []).map((p: any) => ({
            ...p,
            profiles: Array.isArray(p.profiles) ? p.profiles[0] ?? null : p.profiles,
          }));
          setPosts(normalised);
          setLoadingPosts(false);
        });
    });
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  function onCapture(file: File) {
    setLinkedPost(null);
    setCapturedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setState("preview");
  }

  function onGalleryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLinkedPost(null);
    setCapturedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setState("preview");
  }

  function selectPost(post: PostOption) {
    const thumb = post.image_urls?.[0] ?? post.image_url ?? null;
    setLinkedPost(post);
    setCapturedFile(null);                  // no file upload for linked-post shows
    setPreviewUrl(thumb);                   // use post image as background preview
    setState("preview");
  }

  function discard() {
    if (previewUrl && capturedFile) URL.revokeObjectURL(previewUrl);
    setCapturedFile(null);
    setPreviewUrl(null);
    setCaption("");
    setShowCaption(false);
    setError(null);
    setLinkedPost(null);
    setState("camera");
  }

  function share() {
    setError(null);
    startTransition(async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError("Not signed in."); return; }

      let mediaUrl: string | null = null;

      if (capturedFile) {
        // ── Normal camera / gallery show ──
        const ext = capturedFile.name.split(".").pop() ?? "jpg";
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("show-media")
          .upload(path, capturedFile, { contentType: capturedFile.type, upsert: false });
        if (uploadErr) { setError("Upload failed: " + uploadErr.message); return; }
        mediaUrl = supabase.storage.from("show-media").getPublicUrl(path).data.publicUrl;
      } else if (linkedPost) {
        // ── Post-share show — reuse post image as background ──
        mediaUrl = linkedPost.image_urls?.[0] ?? linkedPost.image_url ?? null;
      }

      const { error: insertErr } = await supabase.from("shows").insert({
        user_id: user.id,
        media_url: mediaUrl,
        caption: caption.trim() || null,
        linked_post_id: linkedPost?.id ?? null,
      });

      if (insertErr) { setError(insertErr.message); return; }

      router.push("/home");
      router.refresh();
    });
  }

  /* ──────────────────────────────────────────────────────────
     Post-picker overlay
  ────────────────────────────────────────────────────────── */
  if (state === "pick-post") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 pb-3 pt-14">
          <button
            type="button"
            onClick={() => setState("camera")}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="flex-1 text-center text-base font-bold text-white">
            Share a Post
          </span>
          <span className="w-9" />
        </div>

        {loadingPosts ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 size={28} className="animate-spin text-white/50" />
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <LayoutGrid size={40} className="text-white/25" />
            <p className="text-sm text-white/50">No posts yet</p>
            <p className="text-xs text-white/35">Create a post first, then share it to your Show.</p>
          </div>
        ) : (
          <div className="no-scrollbar grid flex-1 grid-cols-3 gap-0.5 overflow-y-auto">
            {posts.map((post) => {
              const thumb = post.image_urls?.[0] ?? post.image_url;
              return (
                <button
                  key={post.id}
                  type="button"
                  onClick={() => selectPost(post)}
                  className="relative aspect-square w-full overflow-hidden bg-white/5 transition-opacity active:opacity-70"
                >
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt={post.caption ?? "Post"} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Type size={22} className="text-white/30" />
                    </div>
                  )}
                  {/* Text-only indicator */}
                  {!thumb && post.caption && (
                    <p className="absolute inset-0 flex items-center justify-center p-2 text-[10px] leading-tight text-white/70">
                      {post.caption.slice(0, 60)}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  /* ──────────────────────────────────────────────────────────
     Main layout
  ────────────────────────────────────────────────────────── */
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">

      {/* ── CAMERA STATE ──────────────────────────────────── */}
      {state === "camera" && (
        <>
          {/* Top bar */}
          <div className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between px-4 pb-2 pt-14">
            <button
              type="button"
              aria-label="Close"
              onClick={() => router.back()}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm"
            >
              <X size={20} />
            </button>
            <span className="text-base font-extrabold tracking-tight text-white">
              Your Show
            </span>
            <span className="rounded-pill border border-white/30 px-2.5 py-0.5 text-xs text-white/60">
              24h
            </span>
          </div>

          {/* Live camera */}
          <div className="flex-1 overflow-hidden">
            <LiveCamera onCapture={onCapture} />
          </div>

          {/* Bottom-left buttons: Gallery + Share Post */}
          <div className="absolute bottom-10 left-8 z-10 flex flex-col items-center gap-3">
            <button
              type="button"
              aria-label="Pick from gallery"
              onClick={() => galleryRef.current?.click()}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm"
            >
              <Images size={22} />
            </button>
            <button
              type="button"
              aria-label="Share a post"
              onClick={() => setState("pick-post")}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm"
            >
              <LayoutGrid size={20} />
            </button>
            <input
              ref={galleryRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={onGalleryChange}
            />
          </div>

          {/* Labels */}
          <div className="absolute bottom-10 left-24 z-10 flex flex-col gap-3">
            <span className="flex h-12 items-center text-xs font-medium text-white/60">Gallery</span>
            <span className="flex h-12 items-center text-xs font-medium text-white/60">Share Post</span>
          </div>
        </>
      )}

      {/* ── PREVIEW STATE ──────────────────────────────────── */}
      {(state === "preview" || pending) && (
        <>
          {/* Background */}
          <div className="absolute inset-0">
            {previewUrl ? (
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
            <button
              type="button"
              aria-label="Discard"
              onClick={discard}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm"
            >
              <X size={20} />
            </button>
            <button
              type="button"
              aria-label="Toggle caption"
              onClick={() => setShowCaption((v) => !v)}
              className={`flex h-9 w-9 items-center justify-center rounded-full backdrop-blur-sm transition-colors ${
                showCaption ? "bg-accent text-accent-ink" : "bg-black/40 text-white"
              }`}
            >
              <Type size={18} />
            </button>
          </div>

          {/* Linked-post embed preview */}
          {linkedPost && (
            <div
              className="pointer-events-none absolute inset-x-4 z-20 flex items-center gap-3 overflow-hidden rounded-2xl bg-black/55 p-3 backdrop-blur-md ring-1 ring-white/15"
              style={{ bottom: 96 }}
            >
              {(linkedPost.image_urls?.[0] ?? linkedPost.image_url) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={(linkedPost.image_urls?.[0] ?? linkedPost.image_url)!}
                  alt="Post"
                  className="h-14 w-14 shrink-0 rounded-xl object-cover"
                />
              ) : (
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: `hsl(${linkedPost.profiles?.avatar_hue ?? 280}deg 70% 30%)` }}
                >
                  <span className="text-lg font-bold text-white">
                    {(linkedPost.profiles?.display_name ?? linkedPost.profiles?.username ?? "?")[0]?.toUpperCase()}
                  </span>
                </div>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <Avatar
                    name={linkedPost.profiles?.display_name ?? linkedPost.profiles?.username ?? "User"}
                    hue={linkedPost.profiles?.avatar_hue ?? 280}
                    size={16}
                    src={linkedPost.profiles?.avatar_url ?? undefined}
                  />
                  <span className="truncate text-xs font-semibold text-white/80">
                    {linkedPost.profiles?.display_name ?? linkedPost.profiles?.username ?? "User"}
                  </span>
                </div>
                {linkedPost.caption ? (
                  <p className="line-clamp-2 text-xs leading-snug text-white/70">{linkedPost.caption}</p>
                ) : (
                  <p className="text-xs italic text-white/50">View post</p>
                )}
              </div>
              <ExternalLink size={16} className="shrink-0 text-white/50" />
            </div>
          )}

          {/* Caption input */}
          <div
            className="absolute inset-x-4 z-20"
            style={{ bottom: linkedPost ? 180 : 96 }}
          >
            {showCaption ? (
              <input
                autoFocus
                value={caption}
                onChange={(e) => setCaption(e.target.value.slice(0, 150))}
                onBlur={() => { if (!caption.trim()) setShowCaption(false); }}
                placeholder="Add a caption…"
                className="w-full rounded-2xl bg-black/35 px-4 py-3 text-base text-white outline-none backdrop-blur-sm placeholder:text-white/55"
              />
            ) : (
              <button
                type="button"
                onClick={() => setShowCaption(true)}
                className="flex items-center gap-2 text-base font-medium text-white/70 drop-shadow"
              >
                <Type size={18} /> {caption || "Add a caption…"}
              </button>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="absolute inset-x-4 z-20" style={{ bottom: 160 }}>
              <p className="rounded-xl bg-danger/80 px-3 py-2 text-center text-xs text-white backdrop-blur-sm">
                {error}
              </p>
            </div>
          )}

          {/* Bottom action bar */}
          <div className="absolute inset-x-0 bottom-0 z-20 flex items-center gap-2.5 px-4 pb-9 pt-4">
            <span className="flex items-center gap-2 rounded-pill bg-white/15 py-1.5 pl-1.5 pr-3.5 backdrop-blur-sm">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/25 text-white">
                <User size={15} />
              </span>
              <span className="text-sm font-semibold text-white">Your Show</span>
            </span>
            <span className="rounded-pill bg-white/15 px-3.5 py-2 text-sm font-semibold text-white/75 backdrop-blur-sm">
              24h
            </span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={share}
              disabled={pending}
              aria-label="Share to your Show"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-ink shadow-lg transition-transform active:scale-95 disabled:opacity-60"
            >
              {pending ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
