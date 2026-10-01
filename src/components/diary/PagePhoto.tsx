"use client";

/**
 * The picture on a page.
 *
 * Whatever shape it was taken in, up to a limit.
 *
 * It was square, on the reasoning that everything the app crops for itself is
 * — avatars, showcase covers, the grid — and that one height reads well in a
 * list. But those are all pictures of something *else*; a page's photo is
 * usually a face, and cropping a portrait to a square takes the top of the
 * head and the chin, which is the whole subject. Nothing here has to line up
 * in a row, so nothing has to be cropped.
 *
 * The cap is the only rule: a very tall photo stops before it can take the
 * whole screen and push the next page out of sight. 420px by default, or
 * whatever the caller gives it — in the spotlight that is a share of the
 * card height, so a photo page fits the first screen like every other page.
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
  maxHeight = "420px",
}: {
  url: string;
  /** Empty by default: the words under it are the caption. */
  alt?: string;
  className?: string;
  /** How tall the photo may be, as a CSS length. */
  maxHeight?: string;
}) {
  return (
    <div className={`flex w-full justify-center overflow-hidden rounded-2xl bg-black/25 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        loading="lazy"
        draggable={false}
        style={{ maxHeight }}
        className="h-auto w-auto max-w-full"
      />
    </div>
  );
}
