import Image from "next/image";
import { canOptimize } from "@/lib/image-hosts";

/**
 * Rounded-square avatar (Hypefy uses squircles, not circles — a small
 * differentiator from Instagram). Falls back to a gradient + initial.
 *
 * The picture goes through next/image. It used to be a raw <img> with
 * no srcset and no lazy attribute, pointed straight at the upload —
 * and ImageCropper writes those at 1080px, so a feed screen with
 * fifteen faces pulled fifteen full-resolution photographs to paint
 * them into 40px boxes. There are 125 call sites, which is why this
 * one file was the cheapest win in the performance audit.
 *
 * Deliberately not using OptimizedImage: that is a Client Component
 * with load state, and turning every avatar into a client island
 * would trade one cost for another. This stays a Server Component —
 * next/image works in one, and a 40px square has no use for blur-up.
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
        canOptimize(src) ? (
          <Image
            src={src}
            alt={name}
            width={size}
            height={size}
            // Avatars are fixed-size, so one candidate at 1x and one at
            // 2x is the whole useful srcset; `sizes` in px keeps Next
            // from generating the full viewport ladder for a 40px box.
            sizes={`${size}px`}
            className="h-full w-full object-cover"
          />
        ) : (
          // An unexpected host — a future OAuth provider's CDN, say.
          // next/image throws on those, so it never sees them.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={name}
            width={size}
            height={size}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        )
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
