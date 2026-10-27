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
 *   glass — over media, under the caption: one dim line of bold names and
 *     nothing else. It was a frosted squircle carrying its own faces, which
 *     on a Shot is a second panel to read and a second crowd to look at —
 *     the floating deck already shows the faces, so this keeps the names and
 *     gives up everything else. Dimmer than the caption on purpose: the
 *     caption is what the author said, this is a footnote about it.
 */
export function HypeProofLine({
  previewers,
  total,
  onOpen,
  glass = false,
}: {
  previewers: Previewer[];
  /** The post's own hype_count — already loaded, never re-counted. */
  total: number;
  onOpen: () => void;
  glass?: boolean;
}) {
  const said = proofSentence(previewers, total);
  if (!said) return null;

  // Three faces read as a group; two names is the most anyone reads
  // without effort. Over media there are no faces at all — the deck has
  // them, and the same people twice is worse than either.
  const faces = glass ? [] : previewers.slice(0, 3);

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
          ? "flex w-full min-w-0 items-center text-left transition-opacity active:opacity-70"
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
        className={`min-w-0 truncate whitespace-nowrap leading-tight ${
          glass
            ? "text-[11px] font-semibold text-white/55 drop-shadow"
            : "text-[12px] font-medium text-muted"
        }`}
      >
        {said.names.map((n, i) => (
          <span key={n + i}>
            {i > 0 && said.joiner}
            <b className={glass ? "font-bold text-white/70" : "font-extrabold text-foreground"}>{n}</b>
          </span>
        ))}
        {said.tail}
      </span>
    </button>
  );
}
