/**
 * Rounded-square avatar (Hypefy uses squircles, not circles — a small
 * differentiator from Instagram). Falls back to a gradient + initial.
 */
export function Avatar({
  name,
  hue = 200,
  size = 40,
  src,
  className = "",
}: {
  name: string;
  hue?: number;
  size?: number;
  src?: string;
  className?: string;
}) {
  const initial = name?.trim()?.[0]?.toUpperCase() ?? "?";
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-[30%] ${className}`}
      style={{
        width: size,
        height: size,
        background: src
          ? undefined
          : `linear-gradient(140deg, hsl(${hue} 75% 52%), hsl(${(hue + 50) % 360} 70% 38%))`,
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          className="font-bold text-white/95"
          style={{ fontSize: size * 0.4 }}
        >
          {initial}
        </span>
      )}
    </div>
  );
}
