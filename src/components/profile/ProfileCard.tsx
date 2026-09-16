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
import { createClient } from "@/lib/supabase/client";
import { useOverlayBackButton } from "@/lib/overlay-stack";
import { AvatarImg } from "@/components/ui/AvatarImg";
import { VerifiedStar } from "@/components/ui/VerifiedStar";
import { DisplayName } from "@/components/ui/DisplayName";
import { ZoomViewer } from "@/components/ui/ZoomViewer";
import { bannerGradient } from "@/lib/profile";
import {
  CARD_LAYOUTS,
  CARD_THEMES,
  DEFAULT_LAYOUT,
  DEFAULT_THEME,
  type CardLayout,
  type ProfileLink,
  isCardLayout,
  prettyUrl,
  profileUrl,
  safeHref,
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

  useOverlayBackButton(true, onClose);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const load = useCallback(async () => {
    const [linkRes, profRes] = await Promise.all([
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
    ]);

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
            <CardFace
              data={data}
              links={links}
              layout={layout}
              gradient={gradient}
              loading={loading}
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
        <ZoomViewer src={data.avatarUrl} onClose={() => setPhotoOpen(false)} />
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

/** The card itself — what a screenshot captures. */
function CardFace({
  data,
  links,
  layout,
  gradient,
  loading,
  onPhoto,
}: {
  data: ProfileCardData;
  links: ProfileLink[];
  layout: CardLayout;
  gradient: string;
  loading: boolean;
  onPhoto: () => void;
}) {
  const centred = layout === "centred";
  const photoLed = layout === "photo";

  return (
    <div
      className="animate-rise overflow-hidden rounded-[28px] border border-white/10 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]"
      style={{ background: gradient }}
    >
      {photoLed && data.avatarUrl && (
        <button
          type="button"
          onClick={onPhoto}
          aria-label="View photo"
          className="block h-44 w-full"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.avatarUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        </button>
      )}

      <div
        className={`flex flex-col gap-3 p-6 ${
          centred ? "items-center text-center" : "items-start text-left"
        }`}
      >
        {!photoLed && (
          <div
            className={`flex w-full gap-3 ${
              centred ? "flex-col items-center" : "items-center"
            }`}
          >
            <AvatarImg
              url={data.avatarUrl}
              name={data.name}
              hue={data.hue}
              size={centred ? 76 : 56}
              className="rounded-[22px]"
            />
            <Identity data={data} centred={centred} />
          </div>
        )}
        {photoLed && <Identity data={data} centred={false} />}

        {data.bio && (
          <p className="text-sm leading-relaxed text-foreground/80">
            {data.bio}
          </p>
        )}

        {data.tags.length > 0 && (
          <div
            className={`flex flex-wrap gap-1.5 ${
              centred ? "justify-center" : ""
            }`}
          >
            {data.tags.map((t) => (
              <span
                key={t}
                className="rounded-pill border border-white/15 bg-black/25 px-2.5 py-1 text-[11px] font-semibold text-foreground/85"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        <div
          className={`flex gap-4 text-xs ${centred ? "justify-center" : ""}`}
        >
          <Stat n={data.stats.posts} label="Posts" />
          <Stat n={data.stats.followers} label="Followers" />
          <Stat n={data.stats.following} label="Following" />
        </div>

        {/* Link buttons — the reason the card exists rather than the header. */}
        {!loading && links.length > 0 && (
          <div className="mt-1 flex w-full flex-col gap-2">
            {links.map((l) => {
              const href = safeHref(l.url);
              if (!href) return null;
              return (
                <a
                  key={l.id}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer nofollow ugc"
                  className="flex w-full flex-col items-center rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-center transition active:scale-[0.99] hover:bg-black/45"
                >
                  <span className="text-sm font-bold text-foreground">
                    {l.label}
                  </span>
                  <span className="mt-0.5 truncate text-[10px] text-foreground/50">
                    {prettyUrl(href)}
                  </span>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Identity({
  data,
  centred,
}: {
  data: ProfileCardData;
  centred: boolean;
}) {
  return (
    <div className={`min-w-0 ${centred ? "text-center" : "text-left"}`}>
      <div
        className={`flex items-center gap-1 ${centred ? "justify-center" : ""}`}
      >
        <h2 className="flex min-w-0 text-lg font-extrabold tracking-tight">
          <DisplayName name={data.name} profile={data.cosmetics} className="min-w-0 truncate" />
        </h2>
        {data.verified && (
          <VerifiedStar className="h-[15px] w-[15px] shrink-0" />
        )}
      </div>
      {data.username && (
        <p className="text-sm text-foreground/60">@{data.username}</p>
      )}
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <span className="text-foreground/70">
      <b className="font-extrabold text-foreground">{n.toLocaleString()}</b>{" "}
      {label}
    </span>
  );
}

export { CARD_LAYOUTS, CARD_THEMES };
