"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { accentVars } from "@/lib/profile-accent";
import { CardFront, type Follow } from "@/components/profile/ProfileCardFaces";
import { HypefyIdFace } from "@/components/profile/HypefyIdFace";
import { FlipCard } from "@/components/profile/CardFlip";
import { createClient } from "@/lib/supabase/client";
import { useOverlayBackButton } from "@/lib/overlay-stack";
import { AvatarPreview } from "@/components/ui/AvatarPreview";
import { saveHypefyId } from "@/lib/card-image";
import { profileUrl, type ProfileLink } from "@/lib/profile-card";
import { ProfileCardEditor } from "@/components/profile/ProfileCardEditor";

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
  /** When the account started, for the ID's "since". Omitted where the caller has no date. */
  joinedAt?: string | null;
  /** Their place in the join order, for the ID's number. Null until onboarding is finished. */
  memberNo?: number | null;
  /** Their interests, which the ID's one line about them is partly read from. */
  interests?: string[];
  /** One of PRONOUNS, or null for not said. */
  pronouns?: string | null;
  /** The song on their profile, as stored: { title, artist, artwork }. */
  anthem?: unknown;
  /** Name font and glow, when the owner has them. */
  cosmetics?: { is_premium?: boolean | null; name_font?: string | null; name_glow?: string | null };
  /**
   * What the ID's REMARKS reads them by, beyond what they typed.
   *
   * All optional. A caller that cannot supply them gets an earlier-era
   * line rather than a broken one — see card-remarks. lastSeenAt is only
   * ever used through showActivity, which is the profile's own toggle.
   */
  lastSeenAt?: string | null;
  showActivity?: boolean;
  /** The frame they chose to wear, which is fair game because they chose it. */
  avatarDecoration?: string | null;
  stats: { posts: number; followers: number; following: number };
  isOwn: boolean;
};

type Saving = "idle" | "working" | "done" | "failed";

/**
 * The card behind an expanded avatar: one object with two faces.
 *
 * The front is the person and the back is their Hypefy ID. Everything the
 * card does is on the card — share over the photo, turn over at the foot,
 * save on the back — rather than in a row of pills underneath it. A card
 * exists to be screenshotted and sent, and the pills were in every
 * screenshot, reading like part of the browser rather than part of the
 * thing.
 *
 * Customising is not here either. It has its own way in, from Edit profile,
 * because it is a thing the owner does once and everyone else never does,
 * and it was taking the loudest position on a surface that is mostly looked
 * at by other people.
 */
export function ProfileCard({
  data,
  onClose,
  startEditing = false,
}: {
  data: ProfileCardData;
  onClose: () => void;
  /** Open on the editor — from Edit profile's "Profile card" row. Your own card only. */
  startEditing?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const editing = startEditing && data.isOwn;
  const [pane, setPane] = useState<"card" | "edit">(editing ? "edit" : "card");
  const [links, setLinks] = useState<ProfileLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [follow, setFollow] = useState<Follow>(null);
  /**
   * Half-turns taken, signed. The card turns either way under a finger, so
   * which side is showing is the parity of this rather than a flag — see
   * FlipCard.
   */
  const [half, setHalf] = useState(0);
  const flipped = ((half % 2) + 2) % 2 === 1;
  const [shared, setShared] = useState(false);
  const [saving, setSaving] = useState<Saving>("idle");

  useOverlayBackButton(true, onClose);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const load = useCallback(async () => {
    const [linkRes, userRes] = await Promise.all([
      supabase
        .from("profile_links")
        .select("id, label, url, position")
        .eq("user_id", data.userId)
        .order("position", { ascending: true }),
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
    setLoading(false);
  }, [supabase, data.userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const url = profileUrl(data.username);

  async function share() {
    // navigator.share is the native sheet on mobile; clipboard is the
    // desktop fallback. Both can reject (dismissed, no permission), which
    // is not an error worth surfacing.
    if (navigator.share) {
      try {
        await navigator.share({ title: `${data.name} on Hypefy`, url });
        return;
      } catch {
        /* dismissed */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShared(true);
      setTimeout(() => setShared(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  }

  async function save() {
    setSaving("working");
    const result = await saveHypefyId({
      name: data.name,
      username: data.username,
      userId: data.userId,
      url,
      joinedAt: data.joinedAt,
      memberNo: data.memberNo ?? null,
      interests: data.interests ?? [],
      tags: data.tags,
      anthem: data.anthem,
      pronouns: data.pronouns ?? null,
      verified: data.verified,
      // The same signals the screen reads, so the saved rows match it.
      posts: data.stats.posts,
      hypers: data.stats.followers,
      lastSeenAt: data.lastSeenAt ?? null,
      showActivity: data.showActivity,
      frame: data.avatarDecoration ?? null,
      isPremium: data.cosmetics?.is_premium ?? false,
    });
    setSaving(result === "failed" ? "failed" : "done");
    setTimeout(() => setSaving("idle"), 2200);
  }

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
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default" />

      {/* Clear of the system bars. This is a fixed inset-0 overlay, so it
          covers the whole window including whatever the status bar and the
          gesture bar sit over — and the card below sizes itself to what is
          left, so without these it was measuring space it could not have.
          On Android the status bar does not overlay the web view and --sat
          is zero, which is why only the bottom was visibly wrong there. */}
      <div className="relative z-10 flex items-center justify-between px-4 pb-3 pt-[max(0.75rem,var(--sat))]">
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

      <div className="relative z-10 flex min-h-0 flex-1 items-start justify-center overflow-y-auto px-5 pb-[max(1.5rem,var(--sab))]">
        <div className="flex max-h-full w-full max-w-[380px]">
          {pane === "card" ? (
            <FlipCard
              half={half}
              onTurn={(dir) => setHalf((h) => h + dir)}
              label={flipped ? `${data.name}'s Hypefy ID` : `${data.name}'s profile card`}
              front={
                <CardFront
                  data={data}
                  links={links}
                  loading={loading}
                  follow={follow}
                  onPhoto={() => setPhotoOpen(true)}
                  onShare={share}
                  shared={shared}
                  onFlip={() => setHalf((h) => h + 1)}
                />
              }
              back={
                <HypefyIdFace
                  data={data}
                  url={url}
                  onSave={save}
                  saving={saving}
                  onFlip={() => setHalf((h) => h + 1)}
                />
              }
            />
          ) : (
            <ProfileCardEditor
              userId={data.userId}
              links={links}
              onChange={(next) => setLinks(next.links)}
              onDone={() => setPane("card")}
            />
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

