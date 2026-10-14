/**
 * The shape an UpDate takes, wherever it is drawn.
 *
 * One definition, used by the row across the top of Messages and by the
 * composer that writes into it — so what you type is the thing your circle
 * sees, down to the corner radius. They were two hand-built bubbles before:
 * the row's a solid slab with dots, the composer's a bordered box with a
 * speech corner, which is why the popup never looked like the row.
 *
 * A thought, not speech: no border, no shadow, no point — a solid slab with
 * two shrinking dots falling towards whoever thought it.
 */

/** The slab. Radius scales with the box, as everything round here does. */
export const THOUGHT_SHELL = "bg-elevated text-foreground/90";

/**
 * The two dots, from the bubble down to the face.
 *
 * `row` is the size they take in the strip; `stage` is the composer, where
 * the bubble is wide and centred and the face sits under its middle. Both
 * shrink towards the face and overlap their neighbour, so the chain reads
 * as one thing rather than dots hanging in the air.
 */
export function ThoughtDots({
  where = "row",
  faint = false,
}: {
  where?: "row" | "stage";
  faint?: boolean;
}) {
  const fill = faint ? "bg-surface" : "bg-elevated";
  if (where === "stage") {
    return (
      <span aria-hidden>
        {/* Each touches the next: the large one overlaps the bubble above
            it, the small one meets the large one's bottom edge, and the
            face below starts where the small one ends. Spaced apart they
            are two dots in the air beside a picture. */}
        <span className={`absolute -bottom-[12px] left-1/2 h-[13px] w-[13px] -translate-x-7 rounded-full ${fill}`} />
        <span className={`absolute -bottom-[20px] left-1/2 h-[8px] w-[8px] -translate-x-3 rounded-full ${fill}`} />
      </span>
    );
  }
  return (
    <span aria-hidden>
      <span className={`absolute -left-[7px] top-[8px] h-[10px] w-[10px] rounded-full ${fill}`} />
      <span className={`absolute -left-[1px] top-[17px] h-[6px] w-[6px] rounded-full ${fill}`} />
    </span>
  );
}
