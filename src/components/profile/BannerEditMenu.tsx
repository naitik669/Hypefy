"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil, ImageIcon, UserRound, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";
import { ImageCropper } from "@/components/post/ImageCropper";
import { haptics } from "@/lib/haptics";
import { useRouter } from "next/navigation";

type Kind = "avatar" | "banner";

/**
 * Pencil on the banner's top-right, opening a short menu for the two images
 * a profile has.
 *
 * Both already live behind Settings → Edit profile, several taps from the
 * thing being edited. This puts them on the artwork itself, which is where
 * someone is looking when they decide it needs changing.
 *
 * Owner-only: the caller renders it only when the profile belongs to the
 * viewer, and the update is scoped to the signed-in row regardless.
 */
export function BannerEditMenu({ userId }: { userId: string }) {
  const supabase = createClient();
  const toast = useToast();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Tap anywhere else to dismiss — a menu that can only be closed by picking
  // something is a trap on a touch screen.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  function choose(k: Kind) {
    haptics.tap();
    setKind(k);
    setOpen(false);
    fileRef.current?.click();
  }

  function onFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast("Please choose an image file", "error");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast("Image must be under 10MB", "error");
      return;
    }
    setCropSrc(URL.createObjectURL(file));
  }

  async function onCropped(blob: Blob) {
    if (!kind) return;
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
    setBusy(true);

    const bucket = kind === "banner" ? "banners" : "avatars";
    const path = `${userId}/${kind}-${Date.now()}.jpg`;

    const { error: upErr } = await supabase.storage
      .from(bucket)
      .upload(path, blob, {
        upsert: true,
        cacheControl: "3600",
        contentType: "image/jpeg",
      });
    if (upErr) {
      setBusy(false);
      toast("Couldn't upload that image", "error");
      return;
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    const { error } = await supabase
      .from("profiles")
      .update(
        kind === "banner"
          ? { banner_url: data.publicUrl }
          : { avatar_url: data.publicUrl }
      )
      .eq("id", userId);

    setBusy(false);
    if (error) {
      toast("Couldn't save that image", "error");
      return;
    }

    haptics.success();
    toast(kind === "banner" ? "Banner updated" : "Photo updated", "success");
    // The header is server-rendered, so the new URL only appears on a refetch.
    router.refresh();
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />

      <div ref={wrapRef} className="absolute top-3 right-3 z-20">
        <button
          type="button"
          onClick={() => {
            haptics.tap();
            setOpen((o) => !o);
          }}
          disabled={busy}
          aria-label="Edit profile images"
          aria-expanded={open}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md transition-transform active:scale-90 disabled:opacity-60"
        >
          {busy ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Pencil size={15} />
          )}
        </button>

        {open && (
          <div
            role="menu"
            className="animate-rise absolute top-11 right-0 w-52 overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_20px_50px_-12px_rgba(0,0,0,0.9)]"
          >
            <MenuItem
              icon={<UserRound size={16} />}
              label="Change profile photo"
              onClick={() => choose("avatar")}
            />
            <div className="h-px bg-border" />
            <MenuItem
              icon={<ImageIcon size={16} />}
              label="Change banner"
              onClick={() => choose("banner")}
            />
          </div>
        )}
      </div>

      {cropSrc && kind && (
        <ImageCropper
          src={cropSrc}
          // A banner is a wide strip and an avatar is a square; cropping both
          // to the shape they will actually be shown in is the whole point.
          aspect={kind === "banner" ? 3 : 1}
          // A banner spans the whole column, so it needs the pixels a phone's
          // 3x screen will ask of it. An avatar never renders above ~200 CSS
          // px, where 1080 is already more than enough.
          out={kind === "banner" ? 1440 : 1080}
          label={kind === "banner" ? "Frame your banner" : "Frame your photo"}
          onCancel={() => {
            URL.revokeObjectURL(cropSrc);
            setCropSrc(null);
          }}
          onDone={(blob) => void onCropped(blob)}
        />
      )}
    </>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-elevated"
    >
      <span className="text-muted">{icon}</span>
      {label}
    </button>
  );
}
