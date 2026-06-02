import { Link as LinkIcon, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Avatar } from "@/components/ui/Avatar";
import { VerifiedStar } from "@/components/ui/VerifiedStar";
import { ProfileTabs } from "@/components/profile/ProfileTabs";
import { SignOutButton } from "@/components/SignOutButton";
import { currentUser, formatCount } from "@/lib/mock";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-1 flex-col items-center">
      <span className="text-lg font-bold tabular-nums">{formatCount(value)}</span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}

export default function ProfilePage() {
  const u = currentUser;

  return (
    <>
      <PageHeader title={u.name} />

      <div className="px-4 pt-4">
        {/* Avatar + stats */}
        <div className="flex items-center gap-5">
          <Avatar name={u.name} hue={u.hue} size={76} />
          <div className="flex flex-1">
            <Stat label="Posts" value={u.stats.posts} />
            <Stat label="Hypes" value={u.stats.hypes} />
            <Stat label="Rooms" value={u.stats.rooms} />
          </div>
        </div>

        {/* Identity */}
        <div className="mt-3">
          <div className="flex items-center gap-1">
            <span className="font-bold">{u.name}</span>
            {u.verified && <VerifiedStar className="h-6 w-6 text-verified" />}
          </div>
          <p className="text-sm text-muted">{u.handle}</p>
          <p className="mt-1.5 text-sm leading-snug">{u.bio}</p>
          <a
            href={`https://${u.link}`}
            className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-accent"
          >
            <LinkIcon size={13} />
            {u.link}
          </a>
        </div>

        {/* Vibe card */}
        <div className="mt-3 flex items-center gap-2 rounded-card border border-border bg-surface px-3 py-2.5">
          <Sparkles size={16} className="text-accent" />
          <span className="text-sm">
            <span className="text-muted">Current vibe:</span>{" "}
            <span className="font-semibold">{u.vibe}</span>
          </span>
        </div>

        {/* Actions */}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className="h-10 flex-1 rounded-pill border border-border text-sm font-semibold transition-colors hover:bg-white/5"
          >
            Edit profile
          </button>
          <SignOutButton />
        </div>
      </div>

      <ProfileTabs />
    </>
  );
}
