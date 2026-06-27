import { bannerGradient } from "@/lib/profile";

/** Renders a custom uploaded banner image if present, else a preset gradient. */
export function ProfileBanner({
  bannerId,
  bannerUrl,
  className = "",
}: {
  bannerId?: string | null;
  bannerUrl?: string | null;
  className?: string;
}) {
  return (
    <div
      className={`relative w-full overflow-hidden ${className}`}
      style={bannerUrl ? undefined : { background: bannerGradient(bannerId) }}
    >
      {bannerUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={bannerUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        /* subtle top sheen on preset gradients */
        <div className="h-full w-full bg-gradient-to-b from-white/[0.06] to-transparent" />
      )}
    </div>
  );
}
