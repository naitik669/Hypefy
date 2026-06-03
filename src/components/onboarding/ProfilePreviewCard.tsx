import { Avatar } from "@/components/ui/Avatar";

/**
 * Live profile preview card used during setup and on the final intro slide.
 * Clean dark surface, subtle accent strip — no neon/glow.
 */
export function ProfilePreviewCard({
  displayName,
  username,
  bio,
  tags,
  avatarUrl,
  avatarHue,
  compact = false,
}: {
  displayName: string;
  username: string;
  bio: string;
  tags: string[];
  avatarUrl?: string | null;
  avatarHue: number;
  compact?: boolean;
}) {
  const name = displayName.trim() || "Your name";
  const handle = username.trim() || "username";

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-surface">
      {/* Subtle banner strip — controlled accent, not neon */}
      <div
        className={compact ? "h-12 w-full" : "h-16 w-full"}
        style={{
          background:
            "linear-gradient(120deg, rgba(200,255,0,0.16), rgba(200,255,0,0.02) 60%), #111",
        }}
      />

      <div className="px-4 pb-4">
        <div className={compact ? "-mt-7" : "-mt-9"}>
          <Avatar
            name={name}
            hue={avatarHue}
            src={avatarUrl ?? undefined}
            size={compact ? 56 : 72}
            className="rounded-[22px] ring-4 ring-surface"
          />
        </div>

        <p className="mt-2 truncate text-base font-bold tracking-tight">{name}</p>
        <p className="text-sm text-muted">@{handle}</p>

        {bio.trim() && (
          <p className="mt-1.5 text-sm leading-snug text-foreground/90">{bio.trim()}</p>
        )}

        {tags.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span
                key={t}
                className="rounded-lg border border-border bg-elevated px-2.5 py-1 text-xs font-medium text-foreground"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
