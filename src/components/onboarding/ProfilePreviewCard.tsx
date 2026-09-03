import { Avatar } from "@/components/ui/Avatar";
import { APP_ORIGIN } from "@/lib/profile-card";

/**
 * Live profile preview used during setup and on the final intro slide.
 *
 * Shaped like the real profile header — banner, squircle avatar overlapping
 * its lower-left, then identity and tags — because a preview that does not
 * resemble the thing it previews is decoration. The stat row is part of that
 * likeness: zeroes are honest for a new account and they show where the
 * numbers will sit.
 *
 * Every field has a placeholder state. The old card simply omitted an empty
 * bio, so the card jumped in height the moment someone started typing.
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
  const name = displayName.trim();
  const handle = username.trim();
  const bioText = bio.trim();

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-surface">
      {/* Banner. Tinted from the chosen avatar hue so picking a colour
          changes the whole card, not just the tile. */}
      <div
        className={compact ? "h-14 w-full" : "h-20 w-full"}
        style={{
          background: `linear-gradient(120deg, hsl(${avatarHue} 70% 45% / 0.35), hsl(${(avatarHue + 50) % 360} 65% 30% / 0.10) 62%), #111`,
        }}
      />

      <div className="px-4 pb-4">
        <div className="flex items-end justify-between">
          <div
            className={`inline-block rounded-[22px] shadow-[0_8px_20px_rgba(0,0,0,0.45)] ${
              compact ? "-mt-7" : "-mt-9"
            }`}
          >
            <Avatar
              name={name || "?"}
              hue={avatarHue}
              src={avatarUrl ?? undefined}
              size={compact ? 56 : 72}
              className="rounded-[22px] ring-4 ring-surface"
            />
          </div>

          {/* Where the counts will live once there is something to count. */}
          <div className="flex gap-4 pb-1">
            <Stat label="Posts" />
            <Stat label="Hypers" />
            <Stat label="Hyping" />
          </div>
        </div>

        <p
          className={`mt-2 truncate text-base font-bold tracking-tight ${
            name ? "" : "text-faint"
          }`}
        >
          {name || "Your name"}
        </p>
        <p className={`text-sm ${handle ? "text-muted" : "text-faint"}`}>
          @{handle || "username"}
        </p>

        <p
          className={`mt-1.5 text-sm leading-snug ${
            bioText ? "text-foreground/90" : "text-faint italic"
          }`}
        >
          {bioText || "Your bio goes here"}
        </p>

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {tags.length > 0 ? (
            tags.map((t) => (
              <span
                key={t}
                className="rounded-lg border border-border bg-elevated px-2.5 py-1 text-xs font-medium text-foreground"
              >
                {t}
              </span>
            ))
          ) : (
            <span className="rounded-lg border border-dashed border-border px-2.5 py-1 text-xs font-medium text-faint">
              Your tags
            </span>
          )}
        </div>

        {/* The link people will actually share. */}
        <p className="mt-3 truncate border-t border-border pt-2.5 text-[11px] text-faint">
          {APP_ORIGIN.replace(/^https?:\/\//, "")}/u/{handle || "username"}
        </p>
      </div>
    </div>
  );
}

function Stat({ label }: { label: string }) {
  return (
    <div className="text-center">
      <p className="text-sm font-bold text-foreground/70">0</p>
      <p className="text-[10px] tracking-wider text-faint uppercase">{label}</p>
    </div>
  );
}
