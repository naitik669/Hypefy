import { bannerGradient } from "@/lib/profile";

/** Renders a profile banner by id (preset gradient). */
export function ProfileBanner({
  bannerId,
  className = "",
}: {
  bannerId?: string | null;
  className?: string;
}) {
  return (
    <div
      className={`relative w-full overflow-hidden ${className}`}
      style={{ background: bannerGradient(bannerId) }}
    >
      {/* subtle top sheen */}
      <div className="h-full w-full bg-gradient-to-b from-white/[0.06] to-transparent" />
      {/* fade the bottom into the page background so it blends smoothly */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-b from-transparent via-background/40 to-background"
      />
    </div>
  );
}
