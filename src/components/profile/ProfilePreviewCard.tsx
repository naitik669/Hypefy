import { Sparkles } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { ProfileBanner } from "@/components/profile/ProfileBanner";
import { HypeMascot } from "@/components/mascot/HypeMascot";

export function ProfilePreviewCard({
  displayName,
  username,
  bio,
  vibe,
  avatarHue,
  bannerId,
  interests,
  complete,
}: {
  displayName: string;
  username: string;
  bio: string;
  vibe: string;
  avatarHue: number;
  bannerId: string;
  interests: string[];
  complete: boolean;
}) {
  const name = displayName.trim() || "Your name";
  const handle = username.trim() || "username";

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-bold text-muted">Your Hypefy preview</p>
        {complete && (
          <span className="animate-rise">
            <HypeMascot mood="proud" size="sm" animated />
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <ProfileBanner bannerId={bannerId} className="h-20" />
        <div className="px-4 pb-4">
          <div className="-mt-7 mb-2">
            <Avatar
              name={name}
              hue={avatarHue}
              size={56}
              className="rounded-[18px] ring-4 ring-surface"
            />
          </div>
          <p className="text-base font-bold">{name}</p>
          <p className="text-sm text-muted">@{handle}</p>
          {bio.trim() && <p className="mt-1.5 text-sm">{bio}</p>}
          {vibe.trim() && (
            <span className="mt-2 inline-flex items-center gap-1 rounded-pill border border-border bg-elevated px-2.5 py-1 text-xs">
              <Sparkles size={12} className="text-accent" />
              {vibe}
            </span>
          )}
          {interests.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {interests.slice(0, 6).map((i) => (
                <span
                  key={i}
                  className="rounded-pill bg-elevated px-2 py-0.5 text-[11px] text-muted"
                >
                  {i}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
