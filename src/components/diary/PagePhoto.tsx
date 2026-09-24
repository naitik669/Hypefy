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
 * `fit="height"` is for a card whose height is fixed, like the one in the
 * spotlight deck: there the picture takes the height that is left rather than
 * the full width, and stays square by getting narrower. Sized by width in a
 * fixed-height card, a square photo was taller than the card itself and the
 * words and the reply bar ended up on top of it.
 */
export function PagePhoto({
  url,
  alt = "",
  fit = "width",
  className = "",
}: {
  url: string;
  /** Empty by default: the words under it are the caption. */
  alt?: string;
  fit?: "width" | "height";
  className?: string;
}) {
  const size = fit === "height" ? "h-full max-w-full" : "w-full";
  return (
    <div className={`relative aspect-square overflow-hidden rounded-2xl bg-black/25 ${size} ${className}`}>
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
