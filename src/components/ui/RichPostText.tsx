import Link from "next/link";

/**
 * Renders post caption/body with styled, clickable #hashtags and @mentions.
 *
 * @example
 * <RichPostText text="Working on #hypefy with @aman today!" />
 */
export function RichPostText({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  if (!text) return null;

  // Split by hashtags and mentions, keep separators in the array.
  const parts = text.split(/(#[a-zA-Z0-9_]+|@[a-zA-Z0-9_.]+)/g);

  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (part.startsWith("#")) {
          const tag = part.slice(1).toLowerCase();
          return (
            <Link
              key={i}
              href={`/search?tag=${encodeURIComponent(tag)}`}
              className="font-semibold text-accent hover:underline"
            >
              {part}
            </Link>
          );
        }
        if (part.startsWith("@")) {
          const handle = part.slice(1).toLowerCase();
          return (
            <Link
              key={i}
              href={`/u/${encodeURIComponent(handle)}`}
              className="font-semibold text-verified hover:underline"
            >
              {part}
            </Link>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}
