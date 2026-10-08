/**
 * The line above an embedded card in a chat that says what the card is —
 * "Replied to your page", "I forwarded @riya's comment on @aman's post".
 *
 * It is led by a short upright bar, so the eye finds the sentence before it
 * reads it and the card below reads as the subject of that sentence. The bar
 * takes its colour from the same token as a name inside the label, which is
 * why both come from NAME and the bar paints with `bg-current`: they can
 * never drift apart.
 */

/** The tone a name takes inside a label, and the bar that leads it. */
const NAME = "text-foreground/80";

export function EmbedLabel({
  children,
  /** Which edge the label sits against — the same side as its card. */
  align = "start",
  className = "",
}: {
  children: React.ReactNode;
  align?: "start" | "end";
  className?: string;
}) {
  return (
    <span
      className={`mb-1.5 flex max-w-full items-center gap-1.5 px-1 text-[11px] font-semibold text-muted ${
        align === "end" ? "self-end" : "self-start"
      } ${className}`}
    >
      <span aria-hidden className={`h-[11px] w-[2px] shrink-0 rounded-full bg-current ${NAME}`} />
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

/** A name inside a label: brighter than the sentence around it, never white. */
export function EmbedName({ children }: { children: React.ReactNode }) {
  return <span className={NAME}>{children}</span>;
}
