"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { accentVars } from "@/lib/profile-accent";
import {
  X,
  Link2,
  QrCode,
  Pencil,
  Download,
  Share2,
  Image as ImageIcon,
} from "lucide-react";
import { CardFaceFor, type Follow } from "@/components/profile/ProfileCardFaces";
import { createClient } from "@/lib/supabase/client";
import { useOverlayBackButton } from "@/lib/overlay-stack";
import { AvatarPreview } from "@/components/ui/AvatarPreview";
import { bannerGradient } from "@/lib/profile";
import {
  CARD_LAYOUTS,
  CARD_THEMES,
  DEFAULT_LAYOUT,
  DEFAULT_THEME,
  type CardLayout,
  type ProfileLink,
  isCardLayout,
  profileUrl,
} from "@/lib/profile-card";
import { ProfileCardEditor } from "@/components/profile/ProfileCardEditor";
import { ProfileCardQr } from "@/components/profile/ProfileCardQr";

export type ProfileCardData = {
  /** Owner's accent. The card portals to body, so it re-applies it itself. */
  accentId?: string | null;
  userId: string;
  name: string;
  username: string | null;
  bio: string | null;
  tags: string[];
  hue: number;
  avatarUrl: string | null | undefined;
  verified: boolean;
  /** Name font and glow, when the owner has them. */
  cosmetics?: { is_premium?: boolean | null; name_font?: string | null; name_glow?: string | null };
  stats: { posts: number; followers: number; following: number };
  isOwn: boolean;
};

type Pane = "card" | "edit" | "qr";

/**
 * The card behind an expanded avatar.
 *
 * Tapping a profile photo used to open the raw image. It now opens this:
 * the identity, the links, and a QR that resolves to the public profile.
 * The photo is still reachable, just no longer the default.
 */
export function ProfileCard({
  data,
  onClose,
}: {
  data: ProfileCardData;
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [pane, setPane] = useState<Pane>("card");
  const [links, setLinks] = useState<ProfileLink[]>([]);
  const [layout, setLayout] = useState<CardLayout>(DEFAULT_LAYOUT);
  const [theme, setTheme] = useState<string>(DEFAULT_THEME);
  const [loading, setLoading] = useState(true);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [follow, setFollow] = useState<Follow>(null);

  useOverlayBackButton(true, onClose);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const load = useCallback(async () => {
    const [linkRes, profRes, userRes] = await Promise.all([
      supabase
        .from("profile_links")
        .select("id, label, url, position")
        .eq("user_id", data.userId)
        .order("position", { ascending: true }),
      supabase
        .from("profiles")
        .select("card_layout, card_theme")
        .eq("id", data.userId)
        .single(),
      supabase.auth.getUser(),
    ]);

    // The Follow on the card: only on someone else's, and only signed in.
    const viewer = userRes.data.user?.id;
    if (viewer && viewer !== data.userId) {
      const [f, r] = await Promise.all([
        supabase.from("follows").select("id").eq("follower_id", viewer).eq("following_id", data.userId).maybeSingle(),
        supabase
          .from("follow_requests")
          .select("target_id")
          .eq("requester_id", viewer)
          .eq("target_id", data.userId)
          .maybeSingle(),
      ]);
      setFollow({ following: !!f.data, requested: !!r.data });
    }

    setLinks((linkRes.data as ProfileLink[] | null) ?? []);

    const row = profRes.data as {
      card_layout?: string;
      card_theme?: string;
    } | null;
    if (isCardLayout(row?.card_layout)) setLayout(row.card_layout);
    if (row?.card_theme) setTheme(row.card_theme);
    setLoading(false);
  }, [supabase, data.userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const url = profileUrl(data.username);
  const gradient = bannerGradient(theme);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      // Re-applied here on purpose. This card portals to document.body, so
      // it escapes the tinted wrapper in ProfileHeader entirely and would
      // otherwise render in brand lime while the profile behind it does not.
      style={accentVars(data.accentId)}
      className="fixed inset-0 z-[200] flex flex-col bg-black/90 backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-label={`${data.name}'s profile card`}
    >
      {/* Dismiss by tapping the backdrop, matching the photo viewer it replaced. */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />

      <div className="relative z-10 flex items-center justify-between px-4 py-3">
        <span className="text-sm font-extrabold tracking-tight">
          Hypefy<span className="text-accent">.</span>
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-white/10"
        >
          <X size={20} />
        </button>
      </div>

      <div className="relative z-10 flex flex-1 items-start justify-center overflow-y-auto px-5 pb-10">
        <div className="w-full max-w-[380px]">
          {pane === "card" && (
            <CardFaceFor
              layout={layout}
              data={data}
              links={links}
              gradient={gradient}
              loading={loading}
              follow={follow}
              url={url}
              onPhoto={() => setPhotoOpen(true)}
            />
          )}

          {pane === "qr" && (
            <ProfileCardQr
              url={url}
              name={data.name}
              username={data.username}
              onBack={() => setPane("card")}
            />
          )}

          {pane === "edit" && data.isOwn && (
            <ProfileCardEditor
              userId={data.userId}
              links={links}
              layout={layout}
              theme={theme}
              onChange={(next) => {
                if (next.links) setLinks(next.links);
                if (next.layout) setLayout(next.layout);
                if (next.theme) setTheme(next.theme);
              }}
              onDone={() => setPane("card")}
            />
          )}

          {pane === "card" && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <Action
                icon={QrCode}
                label="QR code"
                onClick={() => setPane("qr")}
              />
              {data.avatarUrl && (
                <Action
                  icon={ImageIcon}
                  label="View photo"
                  onClick={() => setPhotoOpen(true)}
                />
              )}
              {data.isOwn && (
                <Action
                  icon={Pencil}
                  label="Edit card"
                  onClick={() => setPane("edit")}
                />
              )}
              <ShareAction url={url} name={data.name} />
            </div>
          )}
        </div>
      </div>

      {photoOpen && data.avatarUrl && (
        <AvatarPreview
          src={data.avatarUrl}
          name={data.name}
          handle={data.username}
          onClose={() => setPhotoOpen(false)}
        />
      )}
    </div>,
    document.body
  );
}

function Action({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof QrCode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-pill border border-white/10 bg-white/[0.06] px-3.5 py-2 text-xs font-semibold text-foreground transition active:scale-95 hover:bg-white/10"
    >
      <Icon size={14} />
      {label}
    </button>
  );
}

function ShareAction({ url, name }: { url: string; name: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    // navigator.share is the native sheet on mobile; clipboard is the
    // desktop fallback. Both can reject (user dismissed, no permission),
    // which is not an error worth surfacing.
    if (navigator.share) {
      try {
        await navigator.share({ title: `${name} on Hypefy`, url });
        return;
      } catch {
        /* dismissed */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <Action
      icon={copied ? Link2 : Share2}
      label={copied ? "Copied" : "Share"}
      onClick={share}
    />
  );
}

export { CARD_LAYOUTS, CARD_THEMES };
