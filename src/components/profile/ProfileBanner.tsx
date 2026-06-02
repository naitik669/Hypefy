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
      className={`w-full overflow-hidden ${className}`}
      style={{ background: bannerGradient(bannerId) }}
    >
      {/* subtle top sheen */}
      <div className="h-full w-full bg-gradient-to-b from-white/[0.06] to-transparent" />
    </div>
  );
}
