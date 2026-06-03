/**
 * Skeleton — a shimmering placeholder block.
 * Uses the `.skeleton` class (shimmer sweep) from globals.css.
 */
export function Skeleton({
  className = "",
  rounded = "rounded-lg",
  style,
}: {
  className?: string;
  rounded?: string;
  style?: React.CSSProperties;
}) {
  return <div aria-hidden className={`skeleton ${rounded} ${className}`} style={style} />;
}

/** A circular skeleton — for avatars / show bubbles. */
export function SkeletonCircle({ size = 44 }: { size?: number }) {
  return <Skeleton rounded="rounded-full" style={{ width: size, height: size }} />;
}

/** A single text line skeleton. */
export function SkeletonLine({
  width = "100%",
  height = 12,
  className = "",
}: {
  width?: string | number;
  height?: number;
  className?: string;
}) {
  return <Skeleton className={className} rounded="rounded-md" style={{ width, height }} />;
}
