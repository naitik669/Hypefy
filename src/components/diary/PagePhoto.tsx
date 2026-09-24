"use client";

/**
 * The picture on a page.
 *
 * Square, because everything the app crops for itself is: avatars, showcase
 * covers, the grid. A page is read at a glance in a deck, and a square is the
 * one shape that stays the same height whichever way the phone is held.
 *
 * It sits above the words rather than behind them — the words keep the size
 * and weight they have on a page with no picture at all, so a photo page and
 * a written page read as the same thing.
 *
 * The spotlight deck does not use this: there a photo page fills the whole
 * card (see FriendDiaryCard).
 */
export function PagePhoto({
  url,
  alt = "",
  className = "",
}: {
  url: string;
  /** Empty by default: the words under it are the caption. */
  alt?: string;
  className?: string;
}) {
  return (
    <div className={`relative aspect-square overflow-hidden rounded-2xl bg-black/25 w-full ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        loading="lazy"
        draggable={false}
        className="h-full w-full object-cover"
      />
    </div>
  );
}
