"use client";

import { Avatar } from "@/components/ui/Avatar";
import { proofSentence, type Previewer } from "@/lib/hype-proof";

/**
 * The faces of the people you follow who hyped this, and their names.
 *
 * Two shapes, one component:
 *
 *   plain — a row under a post's actions, above the caption. The count stays
 *     in the action row but drops to muted while the names carry bold. That
 *     inversion is the whole "Personality > Numbers" idea, in two font
 *     weights.
 *
 *   glass — a frosted white squircle for a Shot, sitting with the caption
 *     rather than on the rail, so the rail keeps its spacing. The same values
 *     as the Spotlight song line, on purpose: a white glass squircle is how
 *     Hypefy overlays anything on media, rather than each surface inventing
 *     its own.
 */
export function HypeProofLine({
  previewers,
  total,
  youHyped = false,
  onOpen,
  glass = false,
}: {
  previewers: Previewer[];
  /** The post's own hype_count — already loaded, never re-counted. */
  total: number;
  youHyped?: boolean;
  onOpen: () => void;
  glass?: boolean;
}) {
  const said = proofSentence(previewers, total, youHyped);
  if (!said) return null;

  // Three faces read as a group; two names is the most anyone reads without
  // effort. Over a photo, two of each — the pill is beside a caption.
  const faces = previewers.slice(0, glass ? 2 : 3);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      aria-label={`Hyped by ${said.names.join(said.joiner)}${said.tail}`}
      className={
        glass
          ? "flex w-fit max-w-full items-center gap-2 rounded-[13px] border border-white/[0.18] bg-white/[0.14] py-1.5 pl-1.5 pr-3 text-left backdrop-blur-md transition-colors hover:bg-white/20"
          : "flex w-full items-center gap-2 text-left transition-opacity active:opacity-70"
      }
    >
      <span aria-hidden className="flex shrink-0">
        {faces.map((p, i) => (
          <span
            key={p.id}
            className="rounded-[30%]"
            style={{
              marginLeft: i === 0 ? 0 : -7,
              // The ring separates a face from the one behind it; over media
              // it borrows from the glass rather than from the card.
              boxShadow: `0 0 0 1.5px ${glass ? "rgba(255,255,255,0.25)" : "var(--color-surface)"}`,
            }}
          >
            <Avatar
              name={p.name ?? p.username ?? "?"}
              hue={p.hue ?? 200}
              size={glass ? 17 : 20}
              src={p.avatar_url ?? undefined}
            />
          </span>
        ))}
      </span>
      <span
        className={`min-w-0 truncate text-[12px] leading-tight ${
          glass ? "font-medium text-white/90" : "font-medium text-muted"
        }`}
      >
        {said.names.map((n, i) => (
          <span key={n + i}>
            {i > 0 && said.joiner}
            <b className={glass ? "font-extrabold text-white" : "font-extrabold text-foreground"}>{n}</b>
          </span>
        ))}
        {said.tail}
      </span>
    </button>
  );
}
