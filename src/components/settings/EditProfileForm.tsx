"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { ProfileBanner } from "@/components/profile/ProfileBanner";
import { BannerPicker } from "@/components/profile/BannerPicker";
import { ImageCropper } from "@/components/post/ImageCropper";
import { PROFILE_TAGS, DEFAULT_BANNER_ID } from "@/lib/profile";
import { updateProfile } from "@/app/(app)/settings/profile/actions";

const HUES = [280, 200, 150, 30, 330, 95, 250, 10];
type UsernameStatus = "idle" | "invalid" | "checking" | "available" | "taken";

export function EditProfileForm({
  userId,
  initial,
}: {
  userId: string;
  initial: {
    displayName: string;
    username: string;
    bio: string;
    avatarHue: number;
    avatarUrl: string | null;
    bannerId: string;
    bannerUrl: string | null;
    profileTags: string[];
  };
}) {
  const supabase = createClient();
  const router = useRouter();

  const [displayName, setDisplayName] = useState(initial.displayName);
  const [username, setUsername] = useState(initial.username);
  const [bio, setBio] = useState(initial.bio);
  const [avatarHue, setAvatarHue] = useState(initial.avatarHue);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initial.avatarUrl);
  const [bannerId, setBannerId] = useState(initial.bannerId || DEFAULT_BANNER_ID);
  const [bannerUrl, setBannerUrl] = useState<string | null>(initial.bannerUrl);
  const [tags, setTags] = useState<string[]>(initial.profileTags);

  const [uStatus, setUStatus] = useState<UsernameStatus>("idle");
  const [uploading, setUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);
  // Crop step: holds the picked image's object URL + which target it's for.
  const [cropper, setCropper] = useState<{ src: string; aspect: number; kind: "avatar" | "banner" } | null>(null);

  function onUsernameChange(raw: string) {
    const u = raw.toLowerCase().replace(/[^a-z0-9_.]/g, "");
    setUsername(u);
    setError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!/^[a-z0-9_.]{3,20}$/.test(u)) {
      setUStatus(u.length === 0 ? "idle" : "invalid");
      return;
    }
    setUStatus("checking");
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase.from("profiles").select("id").eq("username", u).maybeSingle();
      setUStatus(data && data.id !== userId ? "taken" : "available");
    }, 450);
  }

  // Pick a file → validate → open the crop step (square for avatar, wide for banner).
  function pickImage(e: React.ChangeEvent<HTMLInputElement>, kind: "avatar" | "banner") {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Use a JPG, PNG, or WebP image.");
      return;
    }
    const max = kind === "banner" ? 8 : 5;
    if (file.size > max * 1024 * 1024) {
      setError(`Image must be under ${max}MB.`);
      return;
    }
    setError(null);
    setCropper({ src: URL.createObjectURL(file), aspect: kind === "banner" ? 3 : 1, kind });
  }

  // Crop done → upload the cropped square/wide JPEG to the right bucket.
  async function onCropDone(blob: Blob) {
    if (!cropper) return;
    const { kind } = cropper;
    URL.revokeObjectURL(cropper.src);
    setCropper(null);
    const bucket = kind === "banner" ? "banners" : "avatars";
    const path = `${userId}/${kind}-${Date.now()}.jpg`;
    kind === "banner" ? setBannerUploading(true) : setUploading(true);
    const { error: upErr } = await supabase.storage
      .from(bucket)
      .upload(path, blob, { upsert: true, cacheControl: "3600", contentType: "image/jpeg" });
    if (upErr) {
      setError(upErr.message);
    } else {
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      if (kind === "banner") setBannerUrl(data.publicUrl);
      else setAvatarUrl(data.publicUrl);
    }
    kind === "banner" ? setBannerUploading(false) : setUploading(false);
  }

  function toggleTag(tag: string) {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : prev.length >= 5 ? prev : [...prev, tag],
    );
  }

  const formValid =
    displayName.trim().length > 0 &&
    /^[a-z0-9_.]{3,20}$/.test(username) &&
    uStatus !== "taken" &&
    uStatus !== "checking";

  function save() {
    if (!formValid) {
      setError("Add a display name and a valid, available username.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await updateProfile({
        username, displayName, bio, profileTags: tags, avatarHue, avatarUrl, bannerId, bannerUrl,
      });
      if ("error" in res) { setError(res.error); return; }
      setSaved(true);
      router.push("/profile");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6 px-5 pb-32 pt-4">
      {/* Banner + avatar preview */}
      <div className="overflow-hidden rounded-2xl border border-border">
        <ProfileBanner bannerId={bannerId} bannerUrl={bannerUrl} className="h-24" />
        <div className="flex items-center gap-3 px-3 pb-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative -mt-7 h-20 w-20 shrink-0 overflow-hidden rounded-[24px] ring-4 ring-background shadow-[0_8px_20px_rgba(0,0,0,0.45)]"
            aria-label="Change profile picture"
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
            ) : (
              <Avatar name={displayName || "U"} hue={avatarHue} size={80} className="rounded-[24px]" />
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity hover:opacity-100">
              {uploading ? <Loader2 size={20} className="animate-spin text-white" /> : <Camera size={20} className="text-white" />}
            </span>
          </button>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-pill border border-border bg-surface px-3 py-1.5 text-xs font-semibold hover:bg-elevated"
            >
              {avatarUrl ? "Change photo" : "Upload photo"}
            </button>
            {avatarUrl && (
              <button
                type="button"
                onClick={() => setAvatarUrl(null)}
                className="flex items-center gap-1 rounded-pill border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-muted hover:bg-elevated"
              >
                <X size={12} /> Remove
              </button>
            )}
          </div>
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => pickImage(e, "avatar")} />

      {/* Avatar color (fallback when no photo) */}
      {!avatarUrl && (
        <Field label="Avatar color">
          <div className="flex flex-wrap gap-2.5">
            {HUES.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setAvatarHue(h)}
                className={`h-10 w-10 rounded-[14px] transition-all ${avatarHue === h ? "ring-2 ring-accent ring-offset-2 ring-offset-background" : ""}`}
                style={{ background: `linear-gradient(140deg, hsl(${h} 75% 52%), hsl(${(h + 50) % 360} 70% 38%))` }}
                aria-label={`Color ${h}`}
              />
            ))}
          </div>
        </Field>
      )}

      {/* Banner */}
      <Field label="Banner">
        <div className="mb-3 flex gap-2">
          <button
            type="button"
            onClick={() => bannerRef.current?.click()}
            disabled={bannerUploading}
            className="flex items-center gap-1.5 rounded-pill border border-border bg-surface px-3 py-1.5 text-xs font-semibold hover:bg-elevated disabled:opacity-60"
          >
            {bannerUploading ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
            {bannerUrl ? "Change image" : "Upload image"}
          </button>
          {bannerUrl && (
            <button
              type="button"
              onClick={() => setBannerUrl(null)}
              className="flex items-center gap-1 rounded-pill border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-muted hover:bg-elevated"
            >
              <X size={12} /> Use a preset
            </button>
          )}
        </div>
        <input ref={bannerRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => pickImage(e, "banner")} />
        {!bannerUrl && <BannerPicker value={bannerId} onChange={setBannerId} />}
      </Field>

      {/* Display name */}
      <Field label="Display name">
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={30}
          placeholder="What people call you" className="input" />
      </Field>

      {/* Username */}
      <Field label="Username">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 focus-within:border-accent/40">
          <span className="shrink-0 text-sm text-faint">@</span>
          <input value={username} onChange={(e) => onUsernameChange(e.target.value)} placeholder="username"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-faint" />
          {uStatus === "checking" && <Loader2 size={16} className="shrink-0 animate-spin text-muted" />}
          {uStatus === "available" && <Check size={16} className="shrink-0 text-accent" />}
        </div>
        {uStatus === "taken" && <p className="mt-1 text-xs text-danger">That username is taken.</p>}
        {uStatus === "invalid" && <p className="mt-1 text-xs text-muted">3–20 characters: a–z, 0–9, dot, underscore.</p>}
      </Field>

      {/* Bio */}
      <Field label="Bio">
        <textarea value={bio} onChange={(e) => setBio(e.target.value.slice(0, 160))} rows={2}
          placeholder="Tell people what you're about." className="input resize-none" />
        <p className="mt-1 text-right text-xs text-faint">{bio.length}/160</p>
      </Field>

      {/* Tags */}
      <Field label="Tags">
        <p className="mb-2 -mt-0.5 text-xs text-muted">What do you do? Pick up to 5.</p>
        <div className="flex flex-wrap gap-2">
          {PROFILE_TAGS.map((tag) => {
            const on = tags.includes(tag);
            return (
              <button key={tag} type="button" onClick={() => toggleTag(tag)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  on ? "border-accent bg-accent text-accent-ink" : "border-border bg-surface text-foreground hover:bg-elevated"
                }`}>
                {tag}
              </button>
            );
          })}
        </div>
      </Field>

      {/* Sticky save */}
      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[480px] bg-gradient-to-t from-background via-background to-transparent px-5 pb-7 pt-4">
        {error && <p className="mb-2 rounded-lg bg-danger/10 px-3 py-2 text-center text-xs text-danger">{error}</p>}
        <button type="button" onClick={save} disabled={pending || !formValid}
          className="flex h-13 w-full items-center justify-center gap-2 rounded-pill bg-accent py-4 text-base font-bold text-accent-ink transition-transform active:scale-[0.98] disabled:opacity-50">
          {pending ? <><Loader2 size={18} className="animate-spin" /> Saving…</> : saved ? <><Check size={18} /> Profile updated</> : "Save changes"}
        </button>
      </div>

      {cropper && (
        <ImageCropper
          src={cropper.src}
          aspect={cropper.aspect}
          label={cropper.kind === "banner" ? "Crop banner" : "Crop photo"}
          onCancel={() => { URL.revokeObjectURL(cropper.src); setCropper(null); }}
          onDone={(blob) => onCropDone(blob)}
        />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold">{label}</label>
      {children}
    </div>
  );
}
