import { isGifBanner, profileBackground } from "@/lib/profile";

/**
 * Renders a custom uploaded banner image if present, else a preset gradient.
 *
 * A GIF banner is a Premium feature: it shows while its owner has Premium,
 * and the preset gradient shows in its place if the plan lapses.
 *
 * The box is 3:1 — the ratio the cropper frames at — and never a fixed
 * height. It used to be h-36, which is a different SHAPE at every screen
 * width: the app column is capped at 480px, so a banner was 3.2:1 on a
 * desktop and 2.5:1 on a 375px phone, and object-cover quietly ate a
 * different slice of the same image on each. You framed one picture and got
 * two crops. Locking the ratio means the phone shows exactly what the
 * cropper showed, just smaller.
 */
export function ProfileBanner({
  bannerId,
  bannerUrl,
  bannerColors,
  isPremium = false,
  className = "",
}: {
  bannerId?: string | null;
  bannerUrl?: string | null;
  /** Two hex colours mixed by a Premium member; wins over the preset. */
  bannerColors?: string[] | null;
  /** GIF banners draw only for Premium members. */
  isPremium?: boolean;
  className?: string;
}) {
  const url = bannerUrl && (!isGifBanner(bannerUrl) || isPremium) ? bannerUrl : null;
  return (
    <div
      // block auto-width, not w-full: callers add mx-* margins, and margins
      // don't shrink a 100%-width box — w-full made the banner overflow right.
      className={`relative aspect-[3/1] overflow-hidden ${className}`}
      style={url ? undefined : { background: profileBackground({ banner_id: bannerId, banner_colors: bannerColors, is_premium: isPremium }) }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        /* subtle top sheen on preset gradients */
        <div className="h-full w-full bg-gradient-to-b from-white/[0.06] to-transparent" />
      )}
    </div>
  );
}
