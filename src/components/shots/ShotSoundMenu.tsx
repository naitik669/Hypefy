"use client";

import Link from "next/link";
import { EyeOff, Flag, Link2, MoreHorizontal, VolumeX, X } from "lucide-react";
import { SoundBox } from "@/components/music/SoundBox";
import { soundHref } from "@/components/music/SoundPill";
import type { Track } from "@/lib/music";

/**
 * A Shot's sound and its menu, in one card.
 *
 * The rail used to carry both a three-dots button and, under it, the sound's
 * disc: two small round things stacked in a column, which is most of what
 * made the rail as tall as it was. They are one button now — the disc — and
 * this is what it opens.
 *
 * The card grows out of the disc rather than up from the bottom of the
 * screen. A sheet would cover the Shot, and what is in here is mostly about
 * the Shot you are looking at, so it sits beside it instead: anchored to the
 * same corner as the rail, with the close button landing roughly where the
 * small disc was, so the thing you pressed is the thing you press again.
 *
 * What is NOT in here: block, share-to-a-chat, and everything an owner can
 * do to their own Shot. Those keep their full names and their confirmations
 * in the sheet this card's ⋯ opens — a destructive action behind an unnamed
 * icon is how you delete a Shot by accident.
 *
 * The lime button opens the sound's page rather than the composer. Whether a
 * sound may be used for a new Shot is decided server-side (see `canUse` on
 * the sound page) and a reel has no way to know it, so sending someone
 * straight to the composer would sometimes send them somewhere they are not
 * allowed to be.
 */
export function ShotSoundMenu({
  track,
  open,
  onClose,
  isOwner,
  who,
  onCopyLink,
  onNotInterested,
  onMute,
  onReport,
  onMore,
}: {
  track: Track;
  open: boolean;
  onClose: () => void;
  /** The Shot is yours: the quiet actions are meaningless, the sheet is not. */
  isOwner: boolean;
  /** The author, as the Mute action should name them. */
  who: string;
  onCopyLink: () => void;
  onNotInterested: () => void;
  onMute: () => void;
  onReport: () => void;
  /** Everything with a confirmation behind it, in the sheet it already has. */
  onMore: () => void;
}) {
  if (!open) return null;

  /** Done, and the card goes away: every one of these leaves this screen. */
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <>
      {/* A tap anywhere else closes it. Under the card, over everything
          else — including the rail, so a stray tap cannot hype a Shot you
          were only trying to dismiss a menu on. */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 z-40 cursor-default bg-black/40"
      />

      <div
        role="menu"
        aria-label="Sound and more"
        data-shot-sound-menu
        className="absolute bottom-6 right-3 z-50 flex w-[min(19rem,calc(100%-1.5rem))] flex-col gap-3.5 rounded-[1.75rem] border border-white/15 bg-black/85 p-4 pb-1.5 pr-1.5 text-white shadow-[0_16px_40px_rgba(0,0,0,0.6)] backdrop-blur-xl"
      >
        <div className="flex items-center gap-3.5 pr-2.5">
          <SoundBox track={track} size={84} spinning />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="min-w-0">
              <p className="truncate text-[15px] font-extrabold">{track.title}</p>
              {track.artist && <p className="truncate text-xs text-white/60">{track.artist}</p>}
            </div>
            <Link
              href={soundHref(track.id)}
              prefetch={false}
              role="menuitem"
              onClick={onClose}
              className="flex h-[34px] items-center self-start rounded-full bg-accent px-4 text-[13px] font-extrabold text-accent-ink transition-transform active:scale-95"
            >
              Open sound
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-0.5">
          <MenuIcon label="Copy link" short="Link" onClick={run(onCopyLink)}>
            <Link2 size={19} />
          </MenuIcon>
          {!isOwner && (
            <>
              <MenuIcon label="Not interested" short="Hide" onClick={run(onNotInterested)}>
                <EyeOff size={19} />
              </MenuIcon>
              <MenuIcon label={`Mute ${who}`} short="Mute" onClick={run(onMute)}>
                <VolumeX size={19} />
              </MenuIcon>
              <MenuIcon label="Report Shot" short="Report" danger onClick={run(onReport)}>
                <Flag size={19} />
              </MenuIcon>
            </>
          )}
          <MenuIcon label="More options" short="More" onClick={run(onMore)}>
            <MoreHorizontal size={19} />
          </MenuIcon>

          <span className="flex-1" />

          {/* Where the disc was, so closing is a second press in the same
              place as the press that opened it. */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-transform active:scale-90"
          >
            <X size={20} strokeWidth={2.4} />
          </button>
        </div>
      </div>
    </>
  );
}

/**
 * One action: the icon, and a word under it.
 *
 * The word is small, and it is there because this row holds Mute and Report
 * next to each other. Told apart by an unlabelled glyph they are a coin
 * flip, and both are the kind of thing a person only does once.
 */
function MenuIcon({
  label,
  short,
  danger,
  onClick,
  children,
}: {
  /** What it does, in full — the accessible name, and the word when it fits. */
  label: string;
  /** The word under the icon, where the full label is too long for 44px. */
  short?: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-label={label}
      onClick={onClick}
      className={`flex h-14 w-10 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl transition-transform active:scale-90 ${
        danger ? "text-danger" : "text-white"
      }`}
    >
      {children}
      <span className="text-[10px] font-semibold leading-none text-white/70">{short ?? label}</span>
    </button>
  );
}
